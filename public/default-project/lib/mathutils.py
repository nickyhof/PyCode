"""Math utility functions."""

def fibonacci(n: int) -> int:
    """Calculate the nth Fibonacci number."""
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def factorial(n: int) -> int:
    """Calculate n factorial."""
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}! Welcome to PyCode."
