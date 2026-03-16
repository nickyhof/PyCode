"""Application entry point — run with: bazel run //app:app"""
from mathutils import greet, fibonacci

def main():
    print(greet("World"))
    print()
    print("First 5 Fibonacci numbers:")
    for i in range(5):
        print(f"  fib({i}) = {fibonacci(i)}")

if __name__ == "__main__":
    main()
