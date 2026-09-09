'use client';
import { useEffect, useRef, useState } from 'react';
import { registerGameTools, type ModelContext } from '@/lib/game/webmcp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  newGame,
  dispatch,
  quantity,
  quote,
  capacity,
  occupied,
  assets,
  nightPreview,
  achievements,
  readSave,
  rumorStatus,
  active,
} from '@/lib/game/engine';
import {
  GOODS,
  GOOD_IDS,
  RULES,
  WORLD_FAMILIES,
  BUFFS,
} from '@/lib/game/config';
import type {
  Action,
  Bed,
  Meal,
  GameState,
  Good,
  Buff,
} from '@/lib/game/types';
const SAVE = 'bianliang-save-v1';
type Act = (a: Action) => void;
const cash = (n: number) => `${n.toLocaleString('zh-CN')} 文`;
function ActionButton({
  title,
  detail,
  reason,
  onClick,
}: {
  title: string;
  detail: string;
  reason?: string;
  onClick: () => void;
}) {
  return (
    <div className="action-wrap">
      <Button
        variant="outline"
        className="action"
        disabled={!!reason}
        onClick={onClick}
      >
        <strong>{title}</strong>
        <span>{detail}</span>
      </Button>
      {reason && <small>{reason}</small>}
    </div>
  );
}
function Market({ s, act }: { s: GameState; act: Act }) {
  const [counts, setCounts] = useState<Partial<Record<Good, string>>>({});
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">州桥市 · 今日行情</p>
          <h2>{s.phase === 'market' ? '货已铺开，请慢慢挑' : '街头的买卖'}</h2>
        </div>
        {s.phase === 'market' ? (
          <Button variant="outline" onClick={() => act({ type: 'leave' })}>
            离开市场
          </Button>
        ) : (
          <span className="tag">查看免费</span>
        )}
      </div>
      <p className="muted">
        买入是你付出的价格，卖出是你收到的价格。进入市场后，本次访问可连续交易。
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>货物 / 持有</TableHead>
            <TableHead>买 / 卖</TableHead>
            <TableHead>较昨日</TableHead>
            {s.phase === 'market' && (
              <>
                <TableHead>数量</TableHead>
                <TableHead>成交</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {GOOD_IDS.map((g) => {
            const p = quote(s, g),
              prev = s.history.at(-2)?.prices[g].buy,
              diff = prev ? Math.round((s.prices[g].buy / prev - 1) * 100) : 0;
            return (
              <TableRow key={g}>
                <TableCell>
                  <strong>{GOODS[g].name}</strong>
                  <small>
                    {quantity(s, g)} {GOODS[g].unit}
                  </small>
                </TableCell>
                <TableCell>
                  {p.buy} / {p.sell} 文
                </TableCell>
                <TableCell
                  className={diff > 0 ? 'rise' : diff < 0 ? 'fall' : ''}
                >
                  {diff > 0 ? '+' : ''}
                  {diff}%
                </TableCell>
                {s.phase === 'market' && (
                  <>
                    <TableCell>
                      <Input
                        className="qty"
                        aria-label={`${GOODS[g].name}数量`}
                        type="number"
                        min={g === 'grain' ? 0.1 : 1}
                        step={g === 'grain' ? 0.1 : 1}
                        value={counts[g] ?? '1'}
                        onChange={(e) =>
                          setCounts({ ...counts, [g]: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="inline">
                        <Button
                          onClick={() =>
                            act({
                              type: 'trade',
                              side: 'buy',
                              good: g,
                              quantity: Number(counts[g] ?? 1),
                            })
                          }
                        >
                          买入
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            act({
                              type: 'trade',
                              side: 'sell',
                              good: g,
                              quantity: Number(counts[g] ?? 1),
                            })
                          }
                        >
                          卖出
                        </Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <details>
        <summary>最近七日买价记录</summary>
        <div className="history">
          {s.history.map((h) => (
            <p key={h.day}>
              第{h.day}日　
              {GOOD_IDS.map((g) => `${GOODS[g].name} ${h.prices[g].buy}`).join(
                ' · ',
              )}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
function Night({ s, act }: { s: GameState; act: Act }) {
  const [meal, setMeal] = useState<Meal>(
    quantity(s, 'bread') ? 'bread' : 'diner',
  );
  const [bed, setBed] = useState<Bed>(s.rented ? 'home' : 'inn');
  const [feed, setFeed] = useState(
    String(Math.min(s.hens.length, Math.floor(quantity(s, 'grain') * 5))),
  );
  const a = { type: 'night' as const, meal, bed, feed: Number(feed) };
  let preview;
  let error = '';
  try {
    preview = nightPreview(s, a);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section>
      <p className="eyebrow">夜幕降临</p>
      <h2>给今晚一个安排</h2>
      <div className="night-grid">
        <fieldset>
          <legend>晚饭</legend>
          <RadioGroup value={meal} onValueChange={(v) => setMeal(v as Meal)}>
            {(
              [
                ['bread', '炊饼一个'],
                ['egg', '鸡蛋两枚'],
                ['grain', '煮粟米一份'],
                ['diner', '食肆 · 18文 / 体力 +5'],
                ['none', '不吃 · 健康 −8 / 体力 −10'],
              ] as const
            ).map(([v, label]) => (
              <label className="radio" key={v}>
                <RadioGroupItem value={v} />
                {label}
              </label>
            ))}
          </RadioGroup>
        </fieldset>
        <fieldset>
          <legend>落脚处</legend>
          <RadioGroup value={bed} onValueChange={(v) => setBed(v as Bed)}>
            {(
              [
                ['inn', '通铺 · 30文 / 体力回满'],
                ['temple', '庙廊 · 免费 / 体力 +35 / 10%失窃'],
                ['street', '街头 · 免费 / 体力 +20 / 健康 −3 / 20%失窃'],
                ...(s.rented ? [['home', '租屋 · 免费 / 体力回满']] : []),
              ] as [Bed, string][]
            ).map(([v, label]) => (
              <label className="radio" key={v}>
                <RadioGroupItem value={v} />
                {label}
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      </div>
      <label className="feed" htmlFor="feed-count">
        今晚喂几只鸡？
        <Input
          type="number"
          min="0"
          max={s.hens.length}
          value={feed}
          onChange={(e) => setFeed(e.target.value)}
          aria-label="喂鸡数量"
          id="feed-count"
        />
      </label>
      <p className="muted">
        每只消耗0.2份粟米，按编号从小到大喂养。连续三夜断粮死亡。
      </p>
      <div className="receipt">
        {error ? (
          <output>{error}</output>
        ) : (
          <>
            <p>
              合计现金 −{preview!.cash}文 · 粟米 −{preview!.grain}份{' '}
              {preview!.food}
            </p>
            {preview!.unfed.length > 0 && (
              <p>
                今晚不喂：{preview!.unfed.map((id) => `母鸡${id}号`).join('、')}
              </p>
            )}
          </>
        )}
      </div>
      <Button size="lg" disabled={!!error} onClick={() => act(a)}>
        安排妥当，度过这一夜 →
      </Button>
    </section>
  );
}
function Journal({ s }: { s: GameState }) {
  return (
    <Tabs defaultValue="bag">
      <TabsList variant="line">
        <TabsTrigger value="bag">行囊</TabsTrigger>
        <TabsTrigger value="news">情报</TabsTrigger>
        <TabsTrigger value="book">账本</TabsTrigger>
        <TabsTrigger value="rules">规则</TabsTrigger>
      </TabsList>
      <TabsContent value="bag">
        <p className="eyebrow">
          行囊 {occupied(s) / 10} / {capacity(s) / 10}
        </p>
        {s.batches.length ? (
          s.batches.map((b) => (
            <div className="bag-row" key={b.id}>
              <span>
                {GOODS[b.good].name} ×{b.units / 10}
              </span>
              <small>{b.expires ? `第${b.expires}夜末到期` : '耐存货物'}</small>
            </div>
          ))
        ) : (
          <p>行囊空了。</p>
        )}
        <h3>安身与产业</h3>
        <p>
          {s.rented ? '小屋已租至本局结束' : '尚无固定住处'} ·{' '}
          {s.coop ? '已建鸡舍' : '尚无鸡舍'}
        </p>
        <p>
          母鸡 {s.hens.length} / {s.coop ? 12 : 3} 只
        </p>
        {s.hens.map((h) => (
          <p className="muted" key={h.id}>
            母鸡{h.id}号 · {h.hunger ? `已断粮${h.hunger}夜` : '正常'}
          </p>
        ))}
        <p className="muted">
          今日可变卖总额（含现金）：{cash(assets(s))}。住房和鸡舍不可转卖。
        </p>
        <h3>身上发生的事</h3>
        {(Object.keys(s.buffs) as Buff[])
          .filter((b) => active(s, b))
          .map((b) => (
            <p key={b}>
              <strong>{BUFFS[b].name}</strong>
              <small>
                {BUFFS[b].detail} · 至第{s.buffs[b]}日
              </small>
            </p>
          ))}
      </TabsContent>
      <TabsContent value="news">
        <p className="muted">传闻是线索，不是保证；核实以公开事件为准。</p>
        {s.worlds
          .filter((w) => w.heard)
          .reverse()
          .map((w) => (
            <article className="rumor" key={w.id}>
              <span className="tag">{rumorStatus(s, w)}</span>
              <h3>{w.source}</h3>
              <p>{WORLD_FAMILIES.find((f) => f.id === w.family)?.rumor}</p>
              <small>传闻时点：第{w.expected}日前后</small>
              {w.clueKnown && <p className="clue">交叉线索：{w.clue}</p>}
            </article>
          ))}
        {!s.worlds.some((w) => w.heard) && (
          <p>还没听到什么消息。茶馆的一碗茶要8文。</p>
        )}
      </TabsContent>
      <TabsContent value="book">
        <div className="numbers">
          <p>
            已实现贸易利润<strong>{cash(s.stats.profit)}</strong>
          </p>
          <p>
            自产鸡蛋销售收入<strong>{cash(s.stats.eggRevenue)}</strong>
          </p>
          <p>
            饲料累计批次成本<strong>{cash(s.stats.feedCost)}</strong>
          </p>
          <p>
            劳动收入<strong>{cash(s.stats.workIncome)}</strong>
          </p>
        </div>
        <div className="logs">
          {[...s.logs].reverse().map((l) => (
            <p key={l.id}>
              <small>第{l.day}日</small>
              {l.text}{' '}
              {l.cash !== 0 && (
                <b className={l.cash > 0 ? 'fall' : 'rise'}>
                  {l.cash > 0 ? '+' : ''}
                  {l.cash}文
                </b>
              )}
              {l.items && <small>{l.items}</small>}
            </p>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="rules">
        <h3>三十日，三贯钱</h3>
        <p>
          现金达3000文可归航。第30夜后有最后一次机会；不归航则留宋结算，健康归零则死亡。
        </p>
        <p>
          每天两次行动。看行情免费，进入市场花一次行动；市场内可连续买卖。离开后再次进入需要行动。
        </p>
        <p>
          每夜需要吃饭。吃饱且住通铺或租屋，健康恢复2。现金归零还能劳动，体力不足可以休息。
        </p>
        <p>
          基础产蛋概率70%，鸡舍提高至80%。每只鸡每夜吃0.2份粟米，连续三夜断粮死亡。今晚的蛋明天才能用。
        </p>
        <p>
          个人遭遇每日最多一个。查问花5文；线索取决于本次事实，同一个标题没有固定答案。明确标出的成本会扣除，可能回报不会保证。
        </p>
        <p>
          自动存档仅保存在本浏览器。所有价格、人物和事件是游戏设定。日期以第几日为准，不模拟完整历史历法。
        </p>
      </TabsContent>
    </Tabs>
  );
}
export default function Home() {
  const [s, setS] = useState<GameState | null>(null);
  const ref = useRef<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [restart, setRestart] = useState(false);
  const [hasRaw, setHasRaw] = useState(false);
  const toolExecute = useRef<(a: Action, r: number) => { error?: string }>(
    () => ({ error: '尚未就绪' }),
  );
  useEffect(
    () =>
      registerGameTools(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => ref.current,
        (a, r) => toolExecute.current(a, r),
      ),
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(SAVE);
        setHasRaw(!!raw);
        if (raw) setSaved(readSave(raw));
      } catch (e) {
        setStorageError((e as Error).message);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const save = (next: GameState) => {
    ref.current = next;
    setS(next);
    try {
      localStorage.setItem(SAVE, JSON.stringify(next));
      setStorageError('');
      setHasRaw(true);
    } catch {
      setStorageError('本浏览器无法保存；本次仍可玩，关闭页面将丢失进度。');
    }
  };
  const start = () => {
    save(newGame(crypto.getRandomValues(new Uint32Array(1))[0]));
    setRestart(false);
    setError('');
  };
  const act: Act = (a) => {
    if (!ref.current) return;
    const result = dispatch(ref.current, a, s?.revision);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    save(result.state);
  };
  useEffect(() => {
    toolExecute.current = (a, r) => {
      if (!ref.current) return { error: '请先开始游戏' };
      const result = dispatch(ref.current, a, r);
      if (result.error) {
        setError(result.error);
        return { error: result.error };
      }
      setError('');
      save(result.state);
      return {};
    };
  });
  return (
    <main className="game">
      <header className="masthead">
        <div>
          <span className="seal">宋</span>
          <span className="brand">汴梁归途</span>
        </div>
        <span className="edition">文字生存手记 · 本机版</span>
        {s && (
          <Button variant="ghost" onClick={() => setRestart(true)}>
            重新开始
          </Button>
        )}
      </header>
      {storageError && <output className="warning">{storageError}</output>}
      {!s ? (
        <section className="opening">
          <p className="eyebrow">崇宁二年 · 三月初七 · 东京城外</p>
          <h1>
            城门开了。
            <br />
            你的归途，还很远。
          </h1>
          <p>
            你从陌生的城门外醒来。车马、人声、炊饼的热气……
            <br />
            这里是汴梁。口袋里有八百文，手表上只剩三十日。
          </p>
          <div className="watch">
            <span>归航所需</span>
            <strong>三贯钱</strong>
            <span>3,000 文现金 · 30 日内</span>
          </div>
          <div className="inline">
            {saved && (
              <Button
                size="lg"
                onClick={() => {
                  ref.current = saved;
                  setS(saved);
                }}
              >
                继续第 {saved.day} 日的旅程
              </Button>
            )}
            <Button
              size="lg"
              variant={saved ? 'outline' : 'default'}
              disabled={!loaded}
              onClick={() => (hasRaw ? setRestart(true) : start())}
            >
              走进汴梁 →
            </Button>
          </div>
          <small>买卖谋生，听茶客闲谈，也记得给自己找一处落脚地。</small>
        </section>
      ) : (
        <>
          <section className="status">
            <div className="date">
              <span>崇宁二年</span>
              <strong>第 {s.day} 日</strong>
              <span>
                {s.weather} ·{' '}
                {s.phase === 'night' || s.phase === 'last' ? '夜间' : '日间'}
              </span>
            </div>
            {[
              ['现金', cash(s.cash)],
              ['健康', `${s.health} / 100`],
              ['体力', `${s.stamina} / 100`],
              ['行动', `${s.ap} / 2`],
              ['名声', String(s.reputation)],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </section>
          <div className="goal">
            {s.cash >= 3000 &&
              !s.event &&
              !['ended', 'last'].includes(s.phase) && (
                <Button onClick={() => act({ type: 'return' })}>
                  支付3000文归航
                </Button>
              )}
            <span>归航还需 {cash(Math.max(0, RULES.goal - s.cash))}</span>
            <span>余 {30 - s.day} 个完整日</span>
          </div>
          <div className="layout">
            <div className="main-column">
              <section className="story" aria-live="polite">
                <p className="eyebrow">
                  {s.phase === 'ended'
                    ? '这一程的结尾'
                    : s.event
                      ? '街巷之间'
                      : s.phase === 'market'
                        ? '州桥市'
                        : s.phase === 'night'
                          ? '汴梁入夜'
                          : '今日手记'}
                </p>
                <p>{s.story}</p>
              </section>
              {error && (
                <p className="warning" role="alert">
                  {error}
                </p>
              )}
              {s.phase === 'ended' ? (
                <section>
                  <h2>
                    {s.ending === 'return'
                      ? '归去来兮'
                      : s.ending === 'death'
                        ? '长夜无归'
                        : '此地，亦是人间'}
                  </h2>
                  <p>
                    生存 {s.day} 日 ·{' '}
                    {s.ending === 'death'
                      ? s.deathCause
                      : '这段旅程已经记入账本。'}
                  </p>
                  {s.ending === 'return' && (
                    <p>
                      归航前 {cash(s.beforeReturn)}，支付 {cash(RULES.goal)}
                      ，剩余 {cash(s.cash)}。
                    </p>
                  )}
                  <p>
                    最高变卖资产 {cash(s.stats.peakAssets)} · 交易{' '}
                    {s.stats.trades} 次 · 产蛋 {s.stats.eggs} 枚 · 遭遇{' '}
                    {s.stats.events} 次
                  </p>
                  <div className="badges">
                    {achievements(s)
                      .filter(([, ok]) => ok)
                      .map(([name]) => (
                        <span className="tag" key={name}>
                          {name}
                        </span>
                      ))}
                  </div>
                  <Button onClick={() => setRestart(true)}>再走一程</Button>
                </section>
              ) : s.event ? (
                <section className="encounter">
                  <span className="tag">偶遇</span>
                  <h2>{s.event.title}</h2>
                  <p>{s.event.text}</p>
                  <p className="clue">你留意到：{s.event.clue}</p>
                  {s.event.inspected && (
                    <p className="clue">查问得知：{s.event.inspection}</p>
                  )}
                  <div className="actions">
                    {s.event.choices.map((c) => (
                      <ActionButton
                        key={c.id}
                        title={c.label}
                        detail={c.hint}
                        reason={
                          s.cash < (c.cost.cash ?? 0)
                            ? '现金不足'
                            : s.ap < (c.cost.ap ?? 0)
                              ? '行动点不足'
                              : s.stamina < (c.cost.stamina ?? 0)
                                ? '体力不足'
                                : undefined
                        }
                        onClick={() =>
                          act({
                            type: 'choice',
                            id: c.id,
                            eventId: s.event!.id,
                          })
                        }
                      />
                    ))}
                    <ActionButton
                      title="向附近人查问"
                      detail="支付5文，核对本次遭遇的更多线索"
                      reason={
                        s.event.inspected
                          ? '已经查问过'
                          : s.cash < 5
                            ? '现金不足'
                            : undefined
                      }
                      onClick={() => act({ type: 'inspect' })}
                    />
                  </div>
                </section>
              ) : s.phase === 'night' ? (
                <Night s={s} act={act} />
              ) : s.phase === 'last' ? (
                <section>
                  <h2>最后一次归航机会</h2>
                  <p>货物尚未出售的估值不能用于归航。</p>
                  <div className="inline">
                    <Button
                      disabled={s.cash < 3000}
                      onClick={() => act({ type: 'return' })}
                    >
                      支付3000文，归航
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => act({ type: 'stay' })}
                    >
                      留在北宋，结算此生
                    </Button>
                  </div>
                </section>
              ) : (
                <>
                  {s.phase === 'day' && (
                    <section>
                      <p className="eyebrow">今日去处</p>
                      <h2>这半日，去哪里？</h2>
                      <div className="actions">
                        <ActionButton
                          title="州桥市"
                          detail="1行动 · 买卖货物"
                          onClick={() => act({ type: 'market' })}
                        />
                        <ActionButton
                          title="茶馆听消息"
                          detail="1行动 · 8文"
                          reason={
                            s.teaDay === s.day
                              ? '今日已听过'
                              : s.cash < 8
                                ? '茶钱不足'
                                : undefined
                          }
                          onClick={() => act({ type: 'tea' })}
                        />
                        <ActionButton
                          title="码头短工"
                          detail={`1行动 · ${active(s, 'tired') ? 30 : 25}体力 · 收入60文`}
                          reason={
                            s.stamina < (active(s, 'tired') ? 30 : 25)
                              ? '体力不足'
                              : undefined
                          }
                          onClick={() => act({ type: 'short' })}
                        />
                        <ActionButton
                          title="码头重活"
                          detail={`1行动 · ${active(s, 'tired') ? 45 : 40}体力 · 收入75文`}
                          reason={
                            s.health < 40
                              ? '健康需达到40'
                              : s.stamina < (active(s, 'tired') ? 45 : 40)
                                ? '体力不足'
                                : undefined
                          }
                          onClick={() => act({ type: 'heavy' })}
                        />
                        <ActionButton
                          title="坐下歇脚"
                          detail="1行动 · 体力恢复30，消除劳累"
                          onClick={() => act({ type: 'rest' })}
                        />
                        <ActionButton
                          title={s.rented ? '建造鸡舍' : '租住小屋'}
                          detail={
                            s.rented
                              ? '1行动 · 240文 · 最多12只鸡'
                              : '1行动 · 300文 · 住至本局结束'
                          }
                          reason={
                            s.coop
                              ? '鸡舍已经建好'
                              : s.cash < (s.rented ? 240 : 300)
                                ? '现金不足'
                                : undefined
                          }
                          onClick={() =>
                            act({ type: s.rented ? 'coop' : 'rent' })
                          }
                        />
                      </div>
                      <div className="end-row">
                        <Button
                          variant="ghost"
                          onClick={() => act({ type: 'endDay' })}
                        >
                          收工，安排今晚 →
                        </Button>
                      </div>
                    </section>
                  )}
                  <Market s={s} act={act} />
                </>
              )}
            </div>
            <aside>
              <Journal s={s} />
            </aside>
          </div>
        </>
      )}
      <footer>
        《汴梁归途》 · 每一文钱都有来处，每一夜都要过下去。
        {s && <small>本局编号 {s.seed} · 自动保存于本浏览器</small>}
      </footer>
      <AlertDialog open={restart} onOpenChange={setRestart}>
        <AlertDialogContent>
          <AlertDialogTitle>重新走进汴梁？</AlertDialogTitle>
          <AlertDialogDescription>
            开始新局将覆盖本浏览器的当前存档。新故事、行情和遭遇会重新生成。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>保留当前旅程</AlertDialogCancel>
            <Button onClick={start}>开始新局</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
