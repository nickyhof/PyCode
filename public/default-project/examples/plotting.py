"""
Matplotlib Plotting Examples — PyCode Sample Project
Run this with F5 or `python examples/plotting.py` in the terminal!
"""
import matplotlib.pyplot as plt
import math
import random


def main():
    # ─── 1. Line Chart ────────────────────────────────────────

    x = [i * 0.1 for i in range(100)]
    sin_y = [math.sin(v) for v in x]
    cos_y = [math.cos(v) for v in x]

    plt.figure(figsize=(8, 4))
    plt.plot(x, sin_y, label='sin(x)', color='#4fc3f7', linewidth=2)
    plt.plot(x, cos_y, label='cos(x)', color='#f48fb1', linewidth=2, linestyle='--')
    plt.fill_between(x, sin_y, alpha=0.1, color='#4fc3f7')
    plt.title('Sine & Cosine Waves', fontsize=14, fontweight='bold', color='white')
    plt.xlabel('x', color='#aaa')
    plt.ylabel('y', color='#aaa')
    plt.legend(facecolor='#2d2d2d', edgecolor='#444', labelcolor='white')
    plt.grid(True, alpha=0.2)
    plt.gca().set_facecolor('#1e1e1e')
    plt.gca().tick_params(colors='#888')
    plt.tight_layout()
    plt.show()

    # ─── 2. Bar Chart ─────────────────────────────────────────

    languages = ['Python', 'JavaScript', 'Rust', 'Go', 'TypeScript']
    popularity = [85, 78, 45, 52, 72]
    colors = ['#4fc3f7', '#f7df1e', '#dea584', '#00add8', '#3178c6']

    plt.figure(figsize=(8, 4))
    bars = plt.bar(languages, popularity, color=colors, edgecolor='none', width=0.6)
    for bar, val in zip(bars, popularity):
        plt.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1.5,
                 str(val), ha='center', va='bottom', color='white', fontsize=11)
    plt.title('Language Popularity Index', fontsize=14, fontweight='bold', color='white')
    plt.ylabel('Score', color='#aaa')
    plt.ylim(0, 100)
    plt.gca().set_facecolor('#1e1e1e')
    plt.gca().tick_params(colors='#888')
    plt.grid(axis='y', alpha=0.15)
    plt.tight_layout()
    plt.show()

    # ─── 3. Scatter Plot ──────────────────────────────────────

    random.seed(42)
    n = 80
    x_data = [random.gauss(0, 1) for _ in range(n)]
    y_data = [0.5 * x + random.gauss(0, 0.5) for x in x_data]
    sizes = [abs(x) * 80 + 20 for x in x_data]

    plt.figure(figsize=(8, 5))
    scatter = plt.scatter(x_data, y_data, s=sizes, c=y_data,
                          cmap='cool', alpha=0.7, edgecolors='white', linewidth=0.5)
    plt.colorbar(scatter, label='y value')
    plt.title('Scatter Plot with Correlation', fontsize=14, fontweight='bold', color='white')
    plt.xlabel('x', color='#aaa')
    plt.ylabel('y', color='#aaa')
    plt.gca().set_facecolor('#1e1e1e')
    plt.gca().tick_params(colors='#888')
    plt.grid(True, alpha=0.15)
    plt.tight_layout()
    plt.show()

    print("✅ All plots rendered! Check the plot panel above.")


if __name__ == "__main__":
    main()
