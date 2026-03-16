"""Tests for mathutils — run with: bazel test //tests:test_mathutils"""
from mathutils import fibonacci, factorial, greet

# Test fibonacci
assert fibonacci(0) == 0, "fib(0) should be 0"
assert fibonacci(1) == 1, "fib(1) should be 1"
assert fibonacci(10) == 55, "fib(10) should be 55"
print("✓ fibonacci tests passed")

# Test factorial
assert factorial(0) == 1, "0! should be 1"
assert factorial(5) == 120, "5! should be 120"
assert factorial(10) == 3628800, "10! should be 3628800"
print("✓ factorial tests passed")

# Test greet
result = greet("PyCode")
assert "PyCode" in result, f"Greeting should contain name, got: {result}"
print("✓ greet tests passed")

print()
print("All tests passed! ✅")
