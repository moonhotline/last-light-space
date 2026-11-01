#!/usr/bin/env python3
import os
import subprocess
import glob

def optimize_directory(base_dir, max_dim=1024):
    print(f"Scanning {base_dir} for textures to optimize (max dimension: {max_dim})...")
    extensions = ("*.png", "*.jpg", "*.jpeg", "*.PNG", "*.JPG", "*.JPEG")
    files = []
    for ext in extensions:
        files.extend(glob.glob(os.path.join(base_dir, "**", ext), recursive=True))

    total_orig_size = 0
    total_opt_size = 0
    modified_count = 0

    for path in files:
        orig_size = os.path.getsize(path)
        total_orig_size += orig_size

        # Check dimensions using sips
        try:
            res = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                                 capture_output=True, text=True, check=True)
            w = 0
            h = 0
            for line in res.stdout.splitlines():
                if "pixelWidth:" in line:
                    w = int(line.split()[-1])
                elif "pixelHeight:" in line:
                    h = int(line.split()[-1])
            
            if w > max_dim or h > max_dim:
                # Resize image in-place
                subprocess.run(["sips", "-Z", str(max_dim), path], capture_output=True, check=True)
                new_size = os.path.getsize(path)
                total_opt_size += new_size
                modified_count += 1
                print(f"Optimized {os.path.basename(path)}: {orig_size / 1024 / 1024:.2f}MB -> {new_size / 1024 / 1024:.2f}MB ({w}x{h} -> <= {max_dim})")
            else:
                total_opt_size += orig_size
        except Exception as e:
            total_opt_size += orig_size
            print(f"Error optimizing {path}: {e}")

    print(f"\nDone! Optimized {modified_count} textures.")
    print(f"Original total size: {total_orig_size / 1024 / 1024:.2f} MB")
    print(f"New total size:      {total_opt_size / 1024 / 1024:.2f} MB")
    reduction = (1 - total_opt_size / max(1, total_orig_size)) * 100
    print(f"Total size reduction: {reduction:.1f}%")

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "frontend/space-escape/public/assets/models"
    optimize_directory(target, max_dim=1024)
