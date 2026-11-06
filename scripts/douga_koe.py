"""動画の声（ナレーション）を作る。scripts/douga_tsukuru.mjs から呼ぶ（キーは要らない）。

使うもの（権利は docs/権利と出典.md）
- pyopenjtalk（MIT License）… Open JTalk（修正 BSD ライセンス）を Python から使う
- 声：HTS Voice "Mei"（Copyright (c) 2009-2013 Nagoya Institute of Technology, CC BY 3.0）

使い方（ふつうは douga_tsukuru.mjs が呼ぶ）
  python3 scripts/douga_koe.py 入力.json 出力のフォルダ
  入力.json：[{"key": "ki_1", "yomi": "合成に渡す文"}, ...]
  出力：フォルダに key.wav（48kHz・16bit・モノラル）と nagasa.json（key → 秒）

台本の声は speed 1.2（司令塔が台本の秒を測ったときと同じ）。
"""
import json
import os
import sys
import wave

import numpy as np
import pyopenjtalk

SPEED = 1.2


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    with open(src, encoding="utf-8") as f:
        bun = json.load(f)
    nagasa = {}
    for b in bun:
        x, sr = pyopenjtalk.tts(b["yomi"], speed=SPEED)
        x = np.clip(x, -32768, 32767).astype(np.int16)
        with wave.open(os.path.join(out, b["key"] + ".wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(x.tobytes())
        nagasa[b["key"]] = round(len(x) / sr, 3)
        print(f"声：{b['key']} {nagasa[b['key']]:.2f} 秒", file=sys.stderr)
    with open(os.path.join(out, "nagasa.json"), "w", encoding="utf-8") as f:
        json.dump(nagasa, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
