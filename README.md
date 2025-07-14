
---

# 🧠 Cache Visualizer (LRU) – Web Interface

This project provides a web-based interface to visualize how a **Least Recently Used (LRU)** cache works. It allows users to interact with the cache operations and see real-time updates through a simple frontend interface built with HTML, CSS, and JavaScript, supported by a Python backend.

## 🚀 Features

- Interactive UI to simulate cache operations.
- Redis-based backend (assumed) to store cache values.
- Real-time visualization of insertion and eviction logic.
- Python-based server to initialize and connect the backend logic.

## 📁 Project Structure



```
📦CacheManagement
├──TerminalBased
   ├──init.py
   ├──README.md
├── index.html         # Main UI interface
├── main.js            # Handles user interaction logic
├── styles.css         # Stylesheet for the UI
├──README.md
```


## 🛠️ How to Run

### Prerequisites

- Python 3.x
- Redis server (if used)
- Web browser (Chrome/Firefox)

### Setup Steps

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/your-username/cache-visualizer.git
   cd cache-visualizer

2. **Start the Backend:**

   ```bash
   python init.py
   ```

   Or use the terminal version:

   ```bash
   python init-terminal.py
   ```

3. **Open Frontend:**

   Simply open `index.html` in your browser.

## 💡 Use Case

This tool is ideal for:

* Learning how LRU cache works.
* Demonstrating cache eviction in real-time.
* Educational and academic purposes.

## 🌐 Live
```
https://cachemanagementlru.netlify.app
```

## 🧑‍💻 Author

* **Priyanshu Mittal**

## 📜 License

This project is licensed under the MIT License.

---
