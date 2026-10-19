"""마노 MVP용 밸런스 가설 검증 시뮬레이터.

주의: 실제 게임 엔진의 타격, 적 이동, 회피, 생존을 모델링하지 않는다.
       반환하는 P는 튜닝을 위한 '유효 화력 지수'일 뿐 실제 승률이 아니다.

실행: python mano_balance_simulator.py
필요: numpy
"""
import numpy as np
from math import comb

N = 200_000
SEED = 20261019
POOL_SIZE = 16
CHOICES_PER_LEVEL = 3
LEVELS = 18
BATCH = 10_000


def hit_proxy(bounces):
    """유한한 표적 밀도로 인한 평균 명중 효율 감소를 가정한 분석용 함수.
    주의: 실제 게임에서 반사 횟수를 자르는 제한값이 아니다.
    """
    return 1.0 + 7.0 * (1.0 - np.exp(-np.asarray(bounces) / 7.0))


def power_from_counts(counts):
    b, c, d, r = (counts[:, j] for j in range(4))
    balls = 2.0**b
    period = 0.7**c
    damage = 1.5**d
    bounces = 2.0**r
    power = balls * damage / period * hit_proxy(bounces) / hit_proxy(1.0)
    return power, balls, period


def simulate_upgrades():
    rng = np.random.default_rng(SEED)
    all_counts = []
    for _ in range(N // BATCH):
        # 16개 카드 중 각 레벨업에 3개를 균등 무작위, 한 회차 내 중복 없이 뽑기.
        uniforms = rng.random((BATCH, LEVELS, POOL_SIZE), dtype=np.float32)
        options = np.argpartition(uniforms, CHOICES_PER_LEVEL, axis=2)[:, :, :CHOICES_PER_LEVEL]
        # 데모의 플레이어 정책: 공 x2 > 주기 x0.7 > 피해 x1.5 > 반사 x2 > 기타.
        # 0, 1, 2, 3이 네 핵심 카드, 4~15는 기타 카드.
        picks = options.min(axis=2)
        all_counts.append(np.stack([(picks == j).sum(axis=1) for j in range(4)], axis=1))
    counts = np.concatenate(all_counts)
    P, balls, period = power_from_counts(counts)
    print('--- 강화 시뮬레이션: 18회 삼지선다, 16종 중 매회 3종, 200,000판 ---')
    print('화력 지수: P=2^n_ball * 1.5^n_damage / 0.7^n_period * H(2^n_bounce)/H(1)')
    print('H(b)=1+7*(1-exp(-b/7)); 평균 타격 효율만 가정하는 분석 지수')
    for q in [5, 25, 50, 75, 90, 95, 99]:
        print(f'{q:>2}분위 화력 지수 = {np.percentile(P, q):>8.1f}배')
    print('중앙값 발사 공 수:', int(np.median(balls)))
    print('90분위 공 수:', int(np.percentile(balls,90)))
    print('목표 화력지수 550 도달율(스킬·생존·실제 명중 별도):')
    for perma in (1.0, 1.25, 1.5):
        print(f' 영구 공격력 보정 {perma:.2f}x: {np.mean(P*perma >= 550)*100:.1f}%')
    print('탱탱볼 두 배를 6회 이상 제시받을 이론상 확률:')
    # 한 레벨업에서 특정 카드를 제시받을 확률은 3/16, 선택 횟수는 이항분포.
    p = CHOICES_PER_LEVEL / POOL_SIZE
    prob = sum(comb(LEVELS, k) * (p**k) * (1-p)**(LEVELS-k)
               for k in range(6, LEVELS+1))
    print(f' P(X >= 6) = {prob*100:.2f}%')


def simulate_loot():
    rng = np.random.default_rng(2301)
    n = 100_000
    chests = 32  # 첫 클리어한 네 챕터에서 챕터당 상자 8개.
    rolls = chests * 3  # 네 무기가 모두 구현된 경우, 상자당 무기 3개.
    weapons = rng.integers(0,4,size=(n,rolls))
    tiers = rng.choice([1,3,9],size=(n,rolls),p=[0.85,0.12,0.03])
    chosen_equivalent = np.where(weapons == 0, tiers, 0).sum(axis=1)
    chosen_equivalent += 1  # 시작 무기 D급 1개.
    print('\n--- 장비 보상 시뮬레이션: 무기 4종, 첫 4개 챕터, 상자 32개 ---')
    print('상자당 3개, 무기 종류 균등, D 85%/C 12%/B 3%, D=1/C=3/B=9 환산')
    print(f'선택 무기 A등급(27 D환산) 도달: {(chosen_equivalent >= 27).mean()*100:.1f}%')
    print('시작 D 1개 외에 챕터 2·4 최초 클리어 시 선택 무기 C 1개씩 추가 지급 시:')
    print(f'선택 무기 A등급 도달: {(chosen_equivalent + 6 >= 27).mean()*100:.1f}%')
    print('실제 경제는 드롭율/상자 개수/무기 종수가 다르면 반드시 재실행할 것.')


if __name__ == '__main__':
    simulate_upgrades()
    simulate_loot()
