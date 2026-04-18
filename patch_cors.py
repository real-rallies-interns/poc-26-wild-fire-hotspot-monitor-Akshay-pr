import sys

with open('backend/main.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if '"http://127.0.0.1:3000"' in line:
        new_lines.append('        "http://localhost:3001",\n')
        new_lines.append('        "http://127.0.0.1:3001",\n')

with open('backend/main.py', 'w') as f:
    f.writelines(new_lines)
