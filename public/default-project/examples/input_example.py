"""
Interactive Input Example
Demonstrates Python's input() function in PyCode
"""


def main():
    name = input("What's your name? ")
    print(f"Hello, {name}! 👋")

    age = input("How old are you? ")
    print(f"In 10 years you'll be {int(age) + 10}!")

    color = input("Favorite color? ")
    print(f"\n✨ {name} is {age} years old and loves {color}!")


if __name__ == "__main__":
    main()
