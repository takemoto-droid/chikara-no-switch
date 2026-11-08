# 41便：先生の通しの録音を 7 区間に分け、削り、間を詰める（声そのものは切らない・速さは変えない）
# 使い方：このフォルダに moto.wav（38.m4a を ffmpeg -c:a pcm_f32le で wav にしたもの。Git に入れない）を置いて、python3 -I kiru.py
#   sil.txt：無音（ffmpeg silencedetect=noise=-35dB:d=0.18。左右を平均）の頭と終わり
#   dips.txt：小さな切れ目（80Hz より下を切ってから silencedetect=noise=-32dB:d=0.04）の終わり。言葉の中のかけらの頭を寄せるのに使う
#   kt_moto.py：文の中のかけらの頭（元の録音の秒）
# できるもの：koe/01_ki.wav〜07_ketsu.wav（48kHz・ステレオ・32bit）と koe/jikoku.json（Git に入れるのは jikoku.json だけ）
import json, sys, os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'koe')
SR = 48000
MA = 0.7          # 間の上限（秒）
MAE, ATO = 0.08, 0.10   # ファイルの頭・終わりの無音
FADE = 0.005      # つなぎ目のフェード（無音の中だけ）
GAIN = 10 ** (-3 / 20)

sr, x = wavfile.read(os.path.join(D, 'moto.wav'))
assert sr == SR and x.dtype == np.float32
x = x.astype(np.float64)
sos = butter(2, 80, 'highpass', fs=SR, output='sos')
x = sosfiltfilt(sos, x, axis=0) * GAIN

sil = [tuple(map(float, l.split()[:2])) for l in open(os.path.join(D, 'sil.txt'))]
# 0.05 秒未満のすき間でとぎれた無音はひとつにする
m = []
for a, b in sil:
    if m and a - m[-1][1] < 0.05: m[-1] = (m[-1][0], b)
    else: m.append((a, b))
sil = m

KUKAN = [
    ('ki', '01_ki', 0.99, 24.33, [0.99, 14.41, 21.19], [(13.56, 13.73)]),
    ('sho', '02_sho', 25.81, 65.96, [25.81, 30.04, 35.20, 39.54, 44.32, 49.11, 58.27], []),
    ('tenA', '03_tenA', 67.22, 116.40, [67.22, 85.94, 90.78, 100.09, 112.52], [(78.57, 84.03)]),
    ('tenB', '04_tenB', 118.14, 157.47, [118.14, 130.18, 145.29, 153.94], [(119.71, 120.94), (135.78, 139.06), (143.77, 144.98)]),
    ('tenC', '05_tenC', 159.66, 177.53, [159.66, 162.38, 169.36], []),
    ('fukasa', '06_fukasa', 178.87, 194.85, [178.87, 186.46], []),
    ('ketsu', '07_ketsu', 196.25, 206.53, [196.25, 202.80], []),
]
near = lambda t, v, tol=0.045: abs(t - v) <= tol

def koe_no_kubun(s, e):
    """[s,e] の中の声の区切り（無音の外）を返す"""
    v, t = [], None
    inner = [(a, b) for a, b in sil if b > s - 0.03 and a < e + 0.03]
    cur = s
    for a, b in inner:
        if a > cur + 1e-6: v.append((cur, min(a, e)))
        cur = max(cur, b)
    if cur < e - 1e-6: v.append((cur, e))
    return v

exec(open(os.path.join(D, 'kt_moto.py')).read())
dips = [float(l) for l in open(os.path.join(D, 'dips.txt'))]
jikoku, hyou, tsunagi = {}, [], []
os.makedirs(OUT, exist_ok=True)
for kid, name, s, e, atama, kezuru in KUKAN:
    # 範囲の頭と終わりが、無音の境目と合っているか
    s0 = next(b for a, b in sil if near(b, s)); e0 = next(a for a, b in sil if near(a, e))
    v = koe_no_kubun(s0, e0)
    # 削る所：声の区切りにちょうど合うものだけ落とす
    keep = []
    for a, b in v:
        hit = [c for c in kezuru if a >= c[0] - 0.03 and b <= c[1] + 0.03]
        part = [c for c in kezuru if not hit and a < c[1] - 0.03 and b > c[0] + 0.03]
        assert not part, (kid, a, b, part)
        keep.append((a, b, bool(hit)))
    for c in kezuru:
        cov = [k for k in keep if k[2] and k[0] >= c[0] - 0.03 and k[1] <= c[1] + 0.03]
        assert cov and near(cov[0][0], c[0]) and near(cov[-1][1], c[1]), (kid, c, cov)
    # 残す声のかたまり（間に削った声があれば、その前後の無音をひとつの間とみなす）
    pieces = []  # (orig_a, orig_b) のつなぐ順
    koe = [(a, b) for a, b, h in keep if not h]
    gaps = []
    for i in range(len(koe)):
        a, b = koe[i]
        if i == 0:
            pieces.append((a - MAE, a))
        pieces.append((a, b))
        if i + 1 < len(koe):
            na = koe[i + 1][0]
            cut_between = [k for k in keep if k[2] and k[0] >= b - 1e-6 and k[1] <= na + 1e-6]
            if cut_between:
                pre = cut_between[0][0] - b; post = na - cut_between[-1][1]
                G = pre + post
            else:
                pre = post = None; G = na - b
            if not cut_between and G <= MA:
                pieces.append((b, na)); gaps.append((b, na, G, G, False))
            else:
                if cut_between:
                    t = min(post, MA / 2); h = min(pre, MA - t); t = min(post, MA - h)
                else:
                    h = t = MA / 2
                pieces.append(('kiri', b, b + h)); pieces.append(('kiri', na - t, na))
                gaps.append((b, na, G, h + t, bool(cut_between)))
        else:
            pieces.append((b, b + ATO))
    # つなぐ
    segs, mapping, pos = [], [], 0.0
    for p in pieces:
        if p[0] == 'kiri': a, b = p[1], p[2]
        else: a, b = p
        i0, i1 = int(round(a * SR)), int(round(b * SR))
        seg = x[i0:i1].copy()
        mapping.append((a, b, pos))
        segs.append(seg); pos += (i1 - i0) / SR
    # つなぎ目（無音の中）に短いフェード
    n = int(FADE * SR); ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    # フェード：'kiri' の頭（前の切れ目のあと）と終わり
    for i, p in enumerate(pieces):
        if p[0] != 'kiri': continue
        a, b = p[1], p[2]
        # 声の直後から始まる kiri は、終わりをフェードアウト。声の直前で終わる kiri は、頭をフェードイン
        if i + 1 < len(pieces) and pieces[i + 1][0] == 'kiri': segs[i][-n:] *= ramp[::-1, None]
        if i > 0 and pieces[i - 1][0] == 'kiri': segs[i][:n] *= ramp[:, None]
    y = np.concatenate(segs)
    # 頭と終わりも短いフェード（無音の中）
    y[:n] *= ramp[:, None]; y[-n:] *= ramp[::-1, None]
    def o2n(t):
        for a, b, p0 in mapping:
            if a - 1e-6 <= t <= b + 1e-6: return p0 + (t - a)
        raise ValueError((kid, t))
    jj = []
    for si, t in enumerate(atama):
        t1 = next(a for a, b in koe if near(a, t))
        kt = []
        for q in KT[kid][si]:
            if isinstance(q, tuple):
                c = sorted((d for d in dips if abs(d - q[1]) <= 0.15), key=lambda d: abs(d - q[1]))
                q = c[0] if c else q[1]
            else:
                q = next((a for a, b in koe if near(a, q)), next((d for d in dips if abs(d - q) <= 0.06), q))  # 言葉の頭は、無音の境目に合わせる
            kt.append(round(o2n(q), 3))
        assert near(kt[0], o2n(t1), 0.001) and all(b > a for a, b in zip(kt, kt[1:])), (kid, si, kt)
        jj.append({'t0': round(o2n(t1), 3), 'kt': kt})
    jikoku[kid] = jj
    pk = 20 * np.log10(np.max(np.abs(y)))
    wavfile.write(os.path.join(OUT, name + '.wav'), SR, (np.clip(y, -1, 1) * (2 ** 31 - 1)).astype(np.int32))
    for (ga, gb, G, G2, c) in gaps:
        if G2 != G or c:
            tsunagi.append({'kukan': kid, 'mae_koe_owari': round(ga, 3), 'tsugi_koe_atama': round(gb, 3), 'moto_ma': round(G, 3), 'ato_ma': round(G2, 3), 'kezuri': c, 'out_mae': round(o2n(ga), 3), 'out_ato': round(o2n(gb), 3)})
    hyou.append({'kukan': kid, 'file': name, 'mae': round(e - s, 2), 'ato': round(len(y) / SR, 3), 'peak_db': round(pk, 2), 'tsumeta': sum(1 for g in gaps if g[3] != g[2])})

json.dump(jikoku, open(os.path.join(OUT, 'jikoku.json'), 'w'), ensure_ascii=False, indent=1)
json.dump({'hyou': hyou, 'tsunagi': tsunagi}, open(os.path.join(D, 'kiru_kekka.json'), 'w'), ensure_ascii=False, indent=1)
for h in hyou: print(h)
print('合計', round(sum(h['ato'] for h in hyou), 3), '秒（削る前', round(sum(h['mae'] for h in hyou), 2), '）')
print(json.dumps(jikoku, ensure_ascii=False))
