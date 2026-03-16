"""
PyCode — Sample Project
Run this with F5 or the ▶ Run button!
"""
from lib.mathutils import fibonacci, factorial

def main():
    print("PyCode Sample Project 🐍")
    print("=" * 30)
    print()
    print("Fibonacci sequence (first 10):")
    for i in range(10):
        print(f"  fib({i}) = {fibonacci(i)}")
    print()
    print("Factorials:")
    for n in [5, 8, 10]:
        print(f"  {n}! = {factorial(n)}")
    print()
    print("Python is running in your browser!")
    print("Powered by Pyodide (CPython compiled to WebAssembly)")

if __name__ == "__main__":
    main()
