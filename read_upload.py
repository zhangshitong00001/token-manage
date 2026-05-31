import os, subprocess

result = subprocess.run(['find', '/', '-name', '创建用户结果*', '-type', 'f'], capture_output=True, text=True, timeout=10)
print("Find result:", result.stdout)
print("Find errors:", result.stderr[:500] if result.stderr else "none")

result2 = subprocess.run(['find', '/', '-name', '*1778763997497*', '-type', 'f'], capture_output=True, text=True, timeout=10)
print("Find2 result:", result2.stdout)
print("Find2 errors:", result2.stderr[:500] if result2.stderr else "none")
