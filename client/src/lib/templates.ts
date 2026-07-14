export const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript: `// JavaScript
function main() {
  console.log("Hello, World!");
}

main();
`,

  typescript: `// TypeScript
function main(): void {
  console.log("Hello, World!");
}

main();
`,

  python: `# Python
def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
`,

  java: `// Java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,

  cpp: `// C++
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
`,

  c: `// C
#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}
`,

  go: `// Go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`,

  rust: `// Rust
fn main() {
    println!("Hello, World!");
}
`,
};
