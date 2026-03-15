/**
 * Virtual File System — in-memory file storage backed by a Map.
 */

export interface VfsEntry {
  content: string | null;
  type: 'file' | 'directory';
}

/** Default sample project files */
const DEFAULT_FILES: Record<string, string> = {
  'main.py': `"""\nPyCode — Sample Project\nRun this with F5 or the ▶ Run button!\n"""\nfrom lib.mathutils import fibonacci, factorial\n\ndef main():\n    print("PyCode Sample Project 🐍")\n    print("=" * 30)\n    print()\n    print("Fibonacci sequence (first 10):")\n    for i in range(10):\n        print(f"  fib({i}) = {fibonacci(i)}")\n    print()\n    print("Factorials:")\n    for n in [5, 8, 10]:\n        print(f"  {n}! = {factorial(n)}")\n    print()\n    print("Python is running in your browser!")\n    print("Powered by Pyodide (CPython compiled to WebAssembly)")\n\nif __name__ == "__main__":\n    main()\n`,
  'lib/__init__.py': `"""Shared library for the sample project."""\n`,
  'lib/mathutils.py': `"""Math utility functions."""\n\ndef fibonacci(n: int) -> int:\n    """Calculate the nth Fibonacci number."""\n    if n <= 0:\n        return 0\n    elif n == 1:\n        return 1\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n\ndef factorial(n: int) -> int:\n    """Calculate n factorial."""\n    if n < 0:\n        raise ValueError("Factorial is not defined for negative numbers")\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result\n\ndef greet(name: str) -> str:\n    """Return a friendly greeting."""\n    return f"Hello, {name}! Welcome to PyCode."\n`,
  'lib/BUILD.bazel': `py_library(\n    name = "mathutils",\n    srcs = ["mathutils.py"],\n    visibility = ["//visibility:public"],\n)\n`,
  'app/BUILD.bazel': `py_binary(\n    name = "app",\n    srcs = ["main.py"],\n    main = "main.py",\n    deps = ["//lib:mathutils"],\n)\n`,
  'app/main.py': `"""Application entry point — run with: bazel run //app:app"""\nfrom mathutils import greet, fibonacci\n\ndef main():\n    print(greet("World"))\n    print()\n    print("First 5 Fibonacci numbers:")\n    for i in range(5):\n        print(f"  fib({i}) = {fibonacci(i)}")\n\nif __name__ == "__main__":\n    main()\n`,
  'tests/BUILD.bazel': `py_test(\n    name = "test_mathutils",\n    srcs = ["test_mathutils.py"],\n    deps = ["//lib:mathutils"],\n)\n`,
  'tests/test_mathutils.py': `"""Tests for mathutils — run with: bazel test //tests:test_mathutils"""\nfrom mathutils import fibonacci, factorial, greet\n\n# Test fibonacci\nassert fibonacci(0) == 0, "fib(0) should be 0"\nassert fibonacci(1) == 1, "fib(1) should be 1"\nassert fibonacci(10) == 55, "fib(10) should be 55"\nprint("✓ fibonacci tests passed")\n\n# Test factorial\nassert factorial(0) == 1, "0! should be 1"\nassert factorial(5) == 120, "5! should be 120"\nassert factorial(10) == 3628800, "10! should be 3628800"\nprint("✓ factorial tests passed")\n\n# Test greet\nresult = greet("PyCode")\nassert "PyCode" in result, f"Greeting should contain name, got: {result}"\nprint("✓ greet tests passed")\n\nprint()\nprint("All tests passed! ✅")\n`,
  'pyproject.toml': `[project]\nname = "pycode-sample"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = []\n\n[dependency-groups]\ndev = ["pytest", "pytest-cov"]\n`,
  'README.md': `# PyCode Sample Project\n\nPress **F5** or click **Run** to execute main.py.\n\n## Terminal Commands\n\nuv sync                            # Install dependencies\nuv run main.py                     # Run a file\nbazel query //...                  # List build targets\nbazel run //app:app                # Run the app\nbazel test //tests:test_mathutils  # Run tests\ngit status                         # Show changes\ngit clone <url>                    # Clone a repo\n`,
  'data/config.json': `{\n  "project": "PyCode Sample",\n  "version": "1.0.0",\n  "author": "You",\n  "settings": {\n    "debug": true,\n    "max_iterations": 1000\n  }\n}\n`,
};

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children: Record<string, TreeNode>;
}

export class VirtualFileSystem {
  private files = new Map<string, VfsEntry>();

  /** Normalise a path (strip leading slashes) */
  private norm(path: string): string {
    return path.replace(/^\/+/, '');
  }

  /** Initialise with default sample project */
  init(): void {
    this.files.clear();
    for (const [path, content] of Object.entries(DEFAULT_FILES)) {
      this.set(path, content);
    }
  }

  /** Set a file (and auto-create parent directories) */
  set(path: string, content: string): void {
    path = this.norm(path);
    this.files.set(path, { content, type: 'file' });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!this.files.has(dir)) {
        this.files.set(dir, { content: null, type: 'directory' });
      }
    }
  }

  /** Get a file/directory entry */
  get(path: string): VfsEntry | undefined {
    return this.files.get(this.norm(path));
  }

  /** Delete a file or directory (recursively) */
  delete(path: string): void {
    path = this.norm(path);
    const toDelete: string[] = [];
    for (const key of this.files.keys()) {
      if (key === path || key.startsWith(path + '/')) {
        toDelete.push(key);
      }
    }
    toDelete.forEach((k) => this.files.delete(k));
  }

  /** Rename / move a file or directory */
  rename(oldPath: string, newPath: string): void {
    oldPath = this.norm(oldPath);
    newPath = this.norm(newPath);
    const entries: [string, VfsEntry][] = [];
    for (const [key, val] of this.files.entries()) {
      if (key === oldPath || key.startsWith(oldPath + '/')) {
        entries.push([key, val]);
      }
    }
    entries.forEach(([key, val]) => {
      this.files.delete(key);
      this.files.set(newPath + key.slice(oldPath.length), val);
    });
  }

  /** Build a nested tree structure (for file explorer) */
  tree(): TreeNode {
    const root: TreeNode = { name: 'root', type: 'directory', children: {}, path: '' };
    const paths = Array.from(this.files.keys()).sort();
    for (const path of paths) {
      const entry = this.files.get(path)!;
      const parts = path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        if (!node.children[name]) {
          node.children[name] = {
            name,
            type: i < parts.length - 1 ? 'directory' : entry.type,
            children: {},
            path: parts.slice(0, i + 1).join('/'),
          };
        }
        node = node.children[name];
      }
    }
    return root;
  }

  /** Get all files as a plain object { path: content } */
  getAllFiles(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, entry] of this.files.entries()) {
      if (entry.type === 'file') {
        result[path] = entry.content ?? '';
      }
    }
    return result;
  }

  /** Clear all files */
  clear(): void {
    this.files.clear();
  }

  /** Check if a path exists */
  has(path: string): boolean {
    return this.files.has(this.norm(path));
  }

  /** Get all paths */
  keys(): IterableIterator<string> {
    return this.files.keys();
  }

  /** Get all entries */
  entries(): IterableIterator<[string, VfsEntry]> {
    return this.files.entries();
  }
}
