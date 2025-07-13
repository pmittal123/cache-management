import redis
import os
import time
import json
import sys
from datetime import datetime

# Constants
MIN_CACHE_SIZE = 10 * 1024  # 10KB minimum
MAX_CACHE_SIZE = 40 * 1024 * 1024  # 40MB maximum
INITIAL_CACHE_SIZE = 10 * 1024 * 1024  # 10MB default
DEFAULT_TTL = 60  # Default TTL in seconds
CACHE_PREFIX = 'cache:'
METADATA_PREFIX = 'meta:'

class CacheSimulator:
    def __init__(self):
        try:
            self.redis = redis.Redis(
                host='localhost',
                port=6379,
                db=0,
                decode_responses=True,
                socket_timeout=5,
                retry_on_timeout=True
            )
            # Test connection
            self.redis.ping()
            
            self.cache_size = 0
            self.stats = {
                'hits': 0,
                'misses': 0,
                'total': 0
            }
            self.evicted_files = []
            self.update_cache_size()
            
        except redis.ConnectionError:
            print("\nError: Cannot connect to Redis server!")
            print("Please ensure Redis is installed and running:")
            print("1. Open a new terminal")
            print("2. Start Redis server with command: redis-server")
            print("3. Verify Redis is running with command: redis-cli ping")
            sys.exit(1)
        except Exception as e:
            print(f"\nError initializing cache: {str(e)}")
            sys.exit(1)

    def update_cache_size(self):
        """Calculate current cache size with error handling"""
        try:
            total_size = 0
            for key in self.redis.keys(f'{CACHE_PREFIX}*'):
                size = self.redis.memory_usage(key)
                total_size += size
            self.cache_size = total_size
            return total_size
        except redis.RedisError as e:
            print(f"\nError accessing Redis: {str(e)}")
            print("Cache size calculation failed")
            return 0

    def evict_if_needed(self, required_size):
        """Evict files if cache would exceed max size"""
        while (self.cache_size + required_size) > MAX_CACHE_SIZE:
            # Get least recently accessed file
            cache_keys = self.redis.keys(f'{CACHE_PREFIX}*')
            if not cache_keys:
                break
                
            # Get access times
            access_times = {}
            for key in cache_keys:
                filename = key.replace(CACHE_PREFIX, '')
                meta_key = f'{METADATA_PREFIX}{filename}'
                metadata = json.loads(self.redis.get(meta_key) or '{}')
                access_times[key] = metadata.get('last_access', 0)
            
            # Find LRU file
            lru_key = min(access_times.keys(), key=access_times.get)
            
            # Get size before deletion
            evicted_size = self.redis.memory_usage(lru_key)
            
            # Remove file and its metadata
            filename = lru_key.replace(CACHE_PREFIX, '')
            self.redis.delete(lru_key)
            self.redis.delete(f'{METADATA_PREFIX}{filename}')
            
            # Update cache size
            self.cache_size -= evicted_size
            
            print(f"\nEvicted: {filename}")
            print(f"Freed: {evicted_size / 1024:.2f}KB")
            print(f"New cache size: {self.cache_size / 1024:.2f}KB")
            
            # Add to eviction history
            self.evicted_files.insert(0, {
                'filename': filename,
                'size': evicted_size,
                'time': datetime.now().strftime('%H:%M:%S'),
                'reason': 'Cache full - LRU eviction'
            })
            
            # Keep only last 5 evictions
            if len(self.evicted_files) > 5:
                self.evicted_files.pop()

    def adjust_cache_size(self, size_value, unit='KB'):
        """Adjust cache size with unit selection (KB/MB) and bounds checking"""
        global MAX_CACHE_SIZE
        
        try:
            # Convert input to bytes based on unit
            if unit.upper() == 'MB':
                requested_size = int(size_value) * 1024 * 1024  # MB to bytes
                min_mb = MIN_CACHE_SIZE / (1024 * 1024)
                max_mb = MAX_CACHE_SIZE / (1024 * 1024)
                if int(size_value) < min_mb:
                    print(f"\nWarning: Minimum size in MB is {min_mb:.2f}MB")
                    return False
                if int(size_value) > max_mb:
                    print(f"\nWarning: Maximum size in MB is {max_mb:.2f}MB")
                    return False
            else:  # KB
                requested_size = int(size_value) * 1024  # KB to bytes
                min_kb = MIN_CACHE_SIZE / 1024
                max_kb = MIN_CACHE_SIZE / 1024
                if int(size_value) < min_kb:
                    print(f"\nWarning: Minimum size in KB is {min_kb:.0f}KB")
                    return False
                if int(size_value) > max_kb:
                    print(f"\nWarning: Maximum size in KB is {max_kb:.0f}KB")
                    return False
            
            # If new size is smaller than current usage, evict files
            if requested_size < self.cache_size:
                print(f"\nNew size ({requested_size/1024:.0f}KB) is smaller than current usage ({self.cache_size/1024:.0f}KB)")
                print("Evicting files to fit new size...")
                self.evict_if_needed(self.cache_size - requested_size)
            
            # Update max size
            MAX_CACHE_SIZE = requested_size
            print(f"\nCache size adjusted to: {MAX_CACHE_SIZE/1024:.0f}KB ({MAX_CACHE_SIZE/1024/1024:.2f}MB)")
            return True
        
        except ValueError:
            print("\nError: Please enter a valid number")
            return False
        except Exception as e:
            print(f"\nError adjusting cache size: {str(e)}")
            return False

    def get_hit_ratio(self):
        """Calculate current hit ratio"""
        if self.stats['total'] == 0:
            return 0.0
        return (self.stats['hits'] / self.stats['total']) * 100

    def update_stats(self, is_hit):
        """Update cache statistics"""
        if is_hit:
            self.stats['hits'] += 1
        else:
            self.stats['misses'] += 1
        self.stats['total'] += 1

    def check_file(self, filepath, ttl=DEFAULT_TTL):
        """Check if file is in cache and handle accordingly"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
            
        filename = os.path.basename(filepath)
        cache_key = f'{CACHE_PREFIX}{filename}'
        meta_key = f'{METADATA_PREFIX}{filename}'
        
        # Get file stats
        stats = os.stat(filepath)
        file_size = stats.st_size
        
        # Prepare response data
        response = {
            'filename': filename,
            'size': file_size,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }
        
        # Check cache
        cached_content = self.redis.get(cache_key)
        
        if cached_content:
            # Cache HIT
            self.update_stats(True)
            response.update({
                'status': 'HIT',
                'operation': 'redis.get()',
                'content_preview': cached_content[:50] + '...' if len(cached_content) > 50 else cached_content,
                'stats': {
                    'hits': self.stats['hits'],
                    'misses': self.stats['misses'],
                    'hit_ratio': f"{self.get_hit_ratio():.2f}%"
                }
            })
            
            # Update access time
            metadata = {
                'last_access': time.time(),
                'size': file_size
            }
            self.redis.set(meta_key, json.dumps(metadata))
            
            # Add TTL
            self.redis.expire(cache_key, ttl)
            self.redis.expire(meta_key, ttl)
            
            # Add TTL info to response
            response['ttl_remaining'] = self.redis.ttl(cache_key)
            
        else:
            # Cache MISS
            self.update_stats(False)
            # Check if we need to evict
            self.evict_if_needed(file_size)
            
            # Read file
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Store in cache
            self.redis.set(cache_key, content)
            
            # Store metadata
            metadata = {
                'last_access': time.time(),
                'size': file_size
            }
            self.redis.set(meta_key, json.dumps(metadata))
            
            # Add TTL
            self.redis.expire(cache_key, ttl)
            self.redis.expire(meta_key, ttl)
            
            # Add TTL info to response
            response.update({
                'status': 'MISS',
                'operation': 'redis.set()',
                'content_preview': content[:50] + '...' if len(content) > 50 else content,
                'stats': {
                    'hits': self.stats['hits'],
                    'misses': self.stats['misses'],
                    'hit_ratio': f"{self.get_hit_ratio():.2f}%"
                },
                'ttl_set': ttl
            })
            
            # Update cache size
            self.update_cache_size()
            
        return response

    def display_cached_files(self):
        """Display all files currently in cache with their details"""
        cache_keys = self.redis.keys(f'{CACHE_PREFIX}*')
        space_info = self.get_cache_space_info()
        
        print("\n" + "="*50)
        print("Currently Cached Files")
        print("="*50)
        
        if not cache_keys:
            print("\nCache is empty")
            print(f"Available Space: {space_info['available']/1024:.2f}KB")
            print("="*50)
            return

        for key in cache_keys:
            filename = key.replace(CACHE_PREFIX, '')
            meta_key = f'{METADATA_PREFIX}{filename}'
            metadata = json.loads(self.redis.get(meta_key) or '{}')
            ttl = self.redis.ttl(key)
            
            print(f"\nFilename: {filename}")
            print(f"Size: {metadata.get('size', 0)/1024:.2f}KB")
            print(f"Last accessed: {datetime.fromtimestamp(metadata.get('last_access', 0)).strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"TTL remaining: {ttl} seconds")
        
        print("\nCache Space Summary:")
        print(f"Used Space: {space_info['used']/1024:.2f}KB")
        print(f"Available Space: {space_info['available']/1024:.2f}KB")
        print(f"Total Capacity: {space_info['total']/1024:.2f}KB")
        print(f"Space Utilization: {space_info['utilization']:.2f}%")
        print("="*50)

    def get_cache_space_info(self):
        """Get information about cache space usage"""
        used = self.cache_size
        total = MAX_CACHE_SIZE
        available = total - used
        utilization = (used / total) * 100 if total > 0 else 0
        
        return {
            'used': used,
            'total': total,
            'available': available,
            'utilization': utilization
        }

    def display_cache_stats(self):
        """Display detailed cache statistics"""
        print("\n" + "="*50)
        print("Cache Statistics Summary")
        print("="*50)
        
        # Get cache space info
        space_info = self.get_cache_space_info()
        
        print(f"Total Requests: {self.stats['total']}")
        print(f"Cache Hits: {self.stats['hits']}")
        print(f"Cache Misses: {self.stats['misses']}")
        print(f"Hit Ratio: {self.get_hit_ratio():.2f}%")
        
        # Add detailed space information
        print("\nCache Space Usage:")
        print(f"Used Space: {space_info['used']/1024:.2f}KB")
        print(f"Available Space: {space_info['available']/1024:.2f}KB")
        print(f"Total Capacity: {space_info['total']/1024:.2f}KB")
        print(f"Space Utilization: {space_info['utilization']:.2f}%")
        
        if self.evicted_files:
            print("\nRecent Evictions:")
            for eviction in self.evicted_files:
                print(f"- {eviction['filename']} ({eviction['size']/1024:.2f}KB)")
                print(f"  Evicted at: {eviction['time']}")
                print(f"  Reason: {eviction['reason']}")
        
        print("\nCache Size Configuration:")
        print(f"Current Maximum: {MAX_CACHE_SIZE/1024:.0f}KB")
        print(f"Minimum Allowed: {MIN_CACHE_SIZE/1024:.0f}KB")
        print(f"Maximum Allowed: {MAX_CACHE_SIZE/1024/1024:.0f}MB")

    def clear_cache(self):
        """Clear all cached files and metadata"""
        cache_keys = self.redis.keys(f'{CACHE_PREFIX}*')
        meta_keys = self.redis.keys(f'{METADATA_PREFIX}*')
        for key in cache_keys + meta_keys:
            self.redis.delete(key)
        self.cache_size = 0
        return True

def print_response(response):
    """Pretty print the response data"""
    print("\n" + "="*50)
    print(f"Cache {response['status']}")
    print("="*50)
    print(f"Filename: {response['filename']}")
    print(f"Size: {response['size']/1024:.2f}KB")
    print(f"Operation: {response['operation']}")
    print(f"Timestamp: {response['timestamp']}")
    
    # Add TTL information
    if 'ttl_remaining' in response:
        print(f"TTL Remaining: {response['ttl_remaining']} seconds")
    elif 'ttl_set' in response:
        print(f"TTL Set: {response['ttl_set']} seconds")
        
    print(f"Content Preview: {response['content_preview']}")
    print("\nCache Statistics:")
    print(f"Hits: {response['stats']['hits']}")
    print(f"Misses: {response['stats']['misses']}")
    print(f"Hit Ratio: {response['stats']['hit_ratio']}")
    print("="*50 + "\n")

def main():
    simulator = CacheSimulator()
    
    while True:
        print("\nCache Simulator Menu")
        print("-------------------")
        print("1. Access file")
        print("2. Display cached files")
        print("3. Show cache statistics")
        print("4. Show eviction history")
        print("5. Adjust cache size")
        print("6. Clear cache and exit")
        choice = input("Choose option (1-6): ")
        
        if choice == '1':
            filepath = input("Enter file path: ")
            try:
                if not os.path.exists(filepath):
                    raise FileNotFoundError(f"File not found: {filepath}")
                    
                filename = os.path.basename(filepath)
                cache_key = f'{CACHE_PREFIX}{filename}'
                is_cached = simulator.redis.exists(cache_key)
                
                if is_cached:
                    response = simulator.check_file(filepath)
                else:
                    print("\nFile not in cache. Adding to cache...")
                    ttl_input = input(f"Enter TTL in seconds (press Enter for default {DEFAULT_TTL}s): ")
                    ttl = int(ttl_input) if ttl_input.strip() else DEFAULT_TTL
                    response = simulator.check_file(filepath, ttl)
                    
                print_response(response)
                
            except ValueError:
                print("Invalid TTL value. Using default.")
                response = simulator.check_file(filepath)
                print_response(response)
            except Exception as e:
                print(f"Error: {str(e)}")
                
        elif choice == '2':
            simulator.display_cached_files()
            
        elif choice == '3':
            simulator.display_cache_stats()
            
        elif choice == '4':
            if simulator.evicted_files:
                print("\n" + "="*50)
                print("Eviction History")
                print("="*50)
                for eviction in simulator.evicted_files:
                    print(f"\nFile: {eviction['filename']}")
                    print(f"Size: {eviction['size']/1024:.2f}KB")
                    print(f"Time: {eviction['time']}")
                    print(f"Reason: {eviction['reason']}")
            else:
                print("\nNo eviction history available")
                
        elif choice == '5':
            print("\nAdjust Cache Size")
            print("----------------")
            print("Current size: {:.2f}MB ({:.0f}KB)".format(
                MAX_CACHE_SIZE/1024/1024,
                MAX_CACHE_SIZE/1024
            ))
            print("\nSize Ranges:")
            print("KB: 10 KB - 40960 KB")
            print("MB: 0.01 MB - 40 MB")
            
            unit_choice = input("\nChoose unit (KB/MB): ").upper()
            if unit_choice not in ['KB', 'MB']:
                print("Invalid unit. Please choose KB or MB")
                continue
            
            if unit_choice == 'KB':
                print("\nEnter size in KB (10 - 40960):")
            else:
                print("\nEnter size in MB (0.01 - 40):")
            
            size_value = input(f"Enter new cache size in {unit_choice}: ")
            simulator.adjust_cache_size(size_value, unit_choice)
            
        elif choice == '6':
            print("\nClearing cache...")
            if simulator.clear_cache():
                print("Cache emptied successfully!")
            print("Exiting simulator...")
            break
            
        else:
            print("Invalid option. Please try again.")

if __name__ == "__main__":
    main()