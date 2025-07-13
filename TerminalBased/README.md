# 🧠 Redis-based LRU Cache Simulator

This is a command-line Python tool that simulates a **Least Recently Used (LRU)** cache using **Redis**. It allows users to interact with file-based caching, monitor hits/misses, TTL (time-to-live), evictions, and real-time cache size statistics.

---

## 🚀 Features

* Simulates LRU eviction based on Redis key access
* Supports TTL for cache expiration
* Tracks hit/miss ratio, eviction logs, and cache space utilization
* Allows dynamic cache size adjustment
* Displays current cached items and their metadata
* Command-line interactive menu

---

## 🧰 Requirements

* Python 3.6 or higher
* Redis Server
* Python libraries:

  * `redis`
  * `os`, `sys`, `time`, `json`, `datetime`

Install Redis:

```bash
sudo apt install redis-server  # Linux
brew install redis             # macOS
```

Install Python dependencies:

```bash
pip install redis
```

Start Redis server (in a new terminal):

```bash
redis-server
```

---

## 📂 Project Structure

```
cache_simulator.py   # Main simulator script (provided above)
README.md            # Project documentation
```

---

## ▶️ How to Use

### 1. Start Redis server

Ensure Redis is running on `localhost:6379`:

```bash
redis-cli ping  # Should return PONG
```

### 2. Run the Simulator

```bash
python cache_simulator.py
```

### 3. Menu Options

* `1`: Access a file and cache its content
* `2`: Display currently cached files and metadata
* `3`: Show cache performance statistics
* `4`: View recent evicted files
* `5`: Adjust max cache size (in KB or MB)
* `6`: Clear the cache and exit

---

## 💡 Example Use Case

```bash
Choose option (1-6): 1
Enter file path: ./sample.txt
TTL in seconds (or press Enter for default 60): 120
```

Sample Output:

```
Cache MISS
Filename: sample.txt
Size: 0.73KB
TTL Set: 120 seconds
Content Preview: This is the beginning of the file...
Cache Stats: Hits: 3 | Misses: 2 | Hit Ratio: 60.00%
```

---

## 📊 Statistics Tracked

* Total cache requests
* Hits and misses
* Hit ratio percentage
* Current used vs available space
* Recent evicted files (with reason and timestamp)

---

## ⚙️ Cache Configuration

* **Minimum Size**: 10 KB
* **Maximum Size**: 40 MB
* **Default Size**: 10 MB
* **Default TTL**: 60 seconds (modifiable)

---

## 🧼 Clearing the Cache

Choose option `6` from the menu to wipe all Redis keys used by the simulator.

---

## 📜 License

This project is licensed under the MIT License.

---

## 🙋‍♂️ Author

**Parampreet Singh**
Feel free to contribute or report issues!

