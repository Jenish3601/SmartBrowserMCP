#!/usr/bin/env python3
"""Move mouse smoothly using pyautogui (called from Node.js)."""
import sys
import math
import pyautogui

# Disable fail-safe for automated use (failsafe = mouse to corner stops everything)
pyautogui.FAILSAFE = False

def ease_out_cubic(t):
    return 1 - math.pow(1 - t, 3)

def main():
    if len(sys.argv) != 6:
        print("Usage: move_mouse.py <start_x> <start_y> <target_x> <target_y> <steps>")
        sys.exit(1)

    start_x = float(sys.argv[1])
    start_y = float(sys.argv[2])
    target_x = float(sys.argv[3])
    target_y = float(sys.argv[4])
    steps = int(sys.argv[5])

    # Calculate total duration for human-like speed (longer distance = longer time)
    distance = math.sqrt((target_x - start_x)**2 + (target_y - start_y)**2)
    # ~1 second per 400px, minimum 0.8s for very short moves
    duration = max(0.8, distance / 400)

    # Move actual OS cursor with smooth tweened animation
    pyautogui.moveTo(target_x, target_y, duration=duration, tween=pyautogui.easeOutQuad)

if __name__ == "__main__":
    main()
