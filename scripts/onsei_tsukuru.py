"""課題文の音声を、前もって作る（キーは要らない）。

使うもの（権利は docs/権利と出典.md）
- pyopenjtalk（MIT License）… Open JTalk（修正 BSD ライセンス）を Python から使う
- 声：HTS Voice "Mei"（Copyright (c) 2009-2013 Nagoya Institute of Technology, CC BY 3.0）

使い方
  python3 -m venv .onsei-env && .onsei-env/bin/pip install pyopenjtalk
  .onsei-env/bin/python scripts/onsei_tsukuru.py
  （ffmpeg が要る。mp3 にして public/onsei/ に置き、public/onsei/onsei.json に文と音声の対応を書く）

作る文は、画面が読み上げる文とまったく同じにする（public/js/game.js・app.js と同じ組み立て方）。
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
import pyopenjtalk

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "onsei")


def load(name):
    with open(os.path.join(ROOT, "public", "data", name), encoding="utf-8") as f:
        return json.load(f)


def bunshu():
    tana = load("tana.json")
    out = []
    # 棚A（読む／聞く）：本文の全文と、問いの文
    for p in tana["A"]["文章"].values():
        out.append("".join(p["本文"]))
        out.extend(q["文"] for q in p["問い"])
    # 棚D（選んで答える質問）：問いと選択肢
    for q in tana["D"]["質問"].values():
        out.append(f"{q['問い']}。{'。'.join(q['選択肢'])}。")
    return list(dict.fromkeys(out))


def main():
    os.makedirs(OUT, exist_ok=True)
    taiou = {}
    for text in bunshu():
        name = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] + ".mp3"
        taiou[text] = name
        path = os.path.join(OUT, name)
        if os.path.exists(path):
            continue
        x, sr = pyopenjtalk.tts(text)
        x = np.clip(x, -32768, 32767).astype(np.int16)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            with wave.open(tmp.name, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sr)
                w.writeframes(x.tobytes())
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-ac", "1", "-ar", "24000", "-b:a", "40k", path],
                check=True,
            )
            os.unlink(tmp.name)
        print("作った:", name, text[:24])
    # 使わなくなった音声を消す
    for f in os.listdir(OUT):
        if f.endswith(".mp3") and f not in taiou.values():
            os.unlink(os.path.join(OUT, f))
            print("消した:", f)
    with open(os.path.join(OUT, "onsei.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "説明": "前もって作った読み上げの音声。文 → ファイル名。scripts/onsei_tsukuru.py で作る。",
                "声": "Open JTalk・HTS Voice \"Mei\"（(c) Nagoya Institute of Technology, CC BY 3.0）",
                "下書き": "先生が聞いて、読み方の誤りがないかを確かめる（先生未確認）",
                "音声": taiou,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"{len(taiou)} 個の文の音声を用意しました。", file=sys.stderr)


if __name__ == "__main__":
    main()
