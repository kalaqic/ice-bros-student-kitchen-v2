"""
Turns the original tracks in song/ into the files the game loads from assets/audio/ (needs ffmpeg + numpy):
  song/song.flac       -> assets/audio/music.mp3   level music, trailing ~5 s of silence trimmed so the loop restarts quickly
  song/boss-fight.wav  -> assets/audio/boss.flac   exactly 32 beats @109 BPM: the silent first beat is cut, so the
                                                   buffer loops sample-perfect (lossless, no MP3 padding)
  song/win.wav         -> assets/audio/sfx-win.mp3 level-complete jingle (files named sfx-<name> are sound effects)
Originals in song/ are never modified.   python3 tools/prepare_audio.py
"""
import os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'song'), os.path.join(ROOT, 'assets', 'audio')
SR = 44100

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()

def save(a, path, args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', *args, path], input=a.astype('<f4').tobytes(), check=True)
    print(f'{os.path.relpath(path, ROOT)}: {len(a) / SR:.3f}s, {os.path.getsize(path) // 1024} KB')

def audible(a, thr=1e-3):
    nz = np.abs(a).max(1) > thr
    return int(np.argmax(nz)), len(a) - int(np.argmax(nz[::-1]))

def main():
    os.makedirs(OUT, exist_ok=True)
    s = os.path.join(SRC, 'song.flac')
    if os.path.exists(s):
        a = load(s)
        _, end = audible(a)
        a = a[:min(len(a), end + int(0.5 * SR))]               # keep half a second of air after the outro
        save(a, os.path.join(OUT, 'music.mp3'), ['-codec:a', 'libmp3lame', '-b:a', '192k'])
    b = os.path.join(SRC, 'boss-fight.wav')
    if os.path.exists(b):
        a = load(b)
        start, _ = audible(a)                                   # the file starts with one silent beat
        a = a[start:]
        f = 48                                                  # ~1 ms de-click at the seam (inaudible)
        a[-f:] *= np.linspace(1, 0, f)[:, None]
        a[:8] *= np.linspace(0, 1, 8)[:, None]
        save(a, os.path.join(OUT, 'boss.flac'), ['-sample_fmt', 's16', '-codec:a', 'flac'])
    w = os.path.join(SRC, 'win.wav')
    if os.path.exists(w):
        save(load(w), os.path.join(OUT, 'sfx-win.mp3'), ['-codec:a', 'libmp3lame', '-b:a', '160k'])

if __name__ == '__main__':
    sys.exit(main())
