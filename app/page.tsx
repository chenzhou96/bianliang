'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import {
  newGame,
  dispatch,
  quantity,
  quote,
  capacity,
  occupied,
  reserved,
  achievements,
  readSave,
  nightPreview,
  staminaMax,
  active,
  inventoryCost,
  productionPlan,
  actionPreview,
  henCapacity,
} from '@/lib/game/engine';
import {
  GOODS,
  GOOD_IDS,
  HOUSING,
  HOUSING_IDS,
  RECIPES,
  EQUIPMENT,
  EQUIPMENT_IDS,
  SKILLS,
  SKILL_IDS,
  SKILL_LEVELS,
  LESSON_COST,
  XP_TO_LEVEL,
  BUFFS,
} from '@/lib/game/config';
import { registerGameTools, type ModelContext } from '@/lib/game/webmcp';
import type { Action, GameState, Good, Bed, Meal } from '@/lib/game/types';

const SAVE = 'bianliang-save-v2';
const money = (n: number) => `${n.toLocaleString('zh-CN')}文`;
const num = (n: number) => Math.round(n * 10) / 10;
type Act = (a: Action) => void;
type Props = { s: GameState; act: Act };
const tabs = {
  market: '市场',
  assets: '资产',
  production: '生产',
  housing: '住宅',
  people: '人物',
  intel: '情报',
  ledger: '账本',
};
type Tab = keyof typeof tabs;
function Btn({
  children,
  onClick,
  disabled = false,
  subtle = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Button
      className={`btn ${subtle ? 'subtle' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (v: number) => void;
}) {
  return (
    <Pagination className="pager" aria-label="分页">
      <Btn subtle disabled={page === 0} onClick={() => setPage(page - 1)}>
        上一页
      </Btn>
      <span>
        {page + 1} / {Math.max(1, total)}
      </span>
      <Btn
        subtle
        disabled={page + 1 >= total}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </Btn>
    </Pagination>
  );
}
function TextPages({ text, size = 150 }: { text: string; size?: number }) {
  const [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(text.length / size));
  const index = Math.min(page, count - 1);
  return (
    <div className="text-pages">
      <p>{text.slice(index * size, (index + 1) * size)}</p>
      {count > 1 && <Pager page={index} total={count} setPage={setPage} />}
    </div>
  );
}
function Do({
  s,
  act,
  action,
  children,
}: Props & { action: Action; children: React.ReactNode }) {
  const p = actionPreview(s, action);
  return (
    <div className="action">
      <Btn disabled={!!p.error} onClick={() => act(action)}>
        {children}
      </Btn>
      {p.energy > 0 && <small>{p.energy}体力</small>}
      {p.error && <small className="reason">{p.error}</small>}
      {!p.error && p.warning && <small className="reason">{p.warning}</small>}
    </div>
  );
}
function Frame({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h1>{title}</h1>
        <p>{note}</p>
      </div>
      {children}
    </section>
  );
}
function Market({ s, act }: Props) {
  const [category, setCategory] = useState('全部');
  const [page, setPage] = useState(0);
  const [good, setGood] = useState<Good>('grain');
  const [count, setCount] = useState('1');
  const [history, setHistory] = useState(false);
  const list = GOOD_IDS.filter(
    (g) => category === '全部' || GOODS[g].category === category,
  );
  const pages = Math.ceil(list.length / 4);
  const ix = Math.min(page, pages - 1);
  const selected = list.includes(good) ? good : list[0];
  const g = GOODS[selected];
  const q = Number(count);
  const p = quote(s, selected);
  const owned = quantity(s, selected);
  const cost = inventoryCost(s, selected);
  const earliest = s.batches
    .filter((b) => b.good === selected && b.expires !== null)
    .sort((a, b) => a.expires! - b.expires!)[0]?.expires;
  const selectGood = (v: Good) => {
    setGood(v);
    setCount('1');
    setHistory(false);
  };
  return (
    <Frame title="州桥市" note="看行情免费，选一件货，再决定买卖。">
      <div className="toolbar">
        <label>
          商品分类{' '}
          <select
            aria-label="商品分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
          >
            {['全部', ...new Set(GOOD_IDS.map((g) => GOODS[g].category))].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <span>累计搬运 {num(s.daily.tradeUnits)} 单位</span>
        {s.phase === 'market' ? (
          <Do s={s} act={act} action={{ type: 'leave' }}>
            离开市场
          </Do>
        ) : (
          <Do s={s} act={act} action={{ type: 'market' }}>
            进入市场
          </Do>
        )}
      </div>
      <div className="split">
        <div className="list-column">
          <div className="list-label">
            <span>货物 / 持有</span>
            <span>买 / 卖 · 较昨日</span>
          </div>
          <div className="item-list">
            {list.slice(ix * 4, ix * 4 + 4).map((id) => {
              const price = quote(s, id);
              const prev = s.history.at(-2)?.prices[id].buy;
              const change = prev
                ? Math.round((price.buy / prev - 1) * 100)
                : 0;
              return (
                <button
                  key={id}
                  className={`list-item ${selected === id ? 'selected' : ''}`}
                  onClick={() => selectGood(id)}
                >
                  <span>
                    <strong>{GOODS[id].name}</strong>
                    <small>
                      持有 {num(quantity(s, id))} {GOODS[id].unit}
                    </small>
                  </span>
                  <span>
                    {price.buy} / {price.sell}文
                    <small className={change > 0 ? 'rise' : 'fall'}>
                      {change > 0 ? '+' : ''}
                      {change}%
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
          <Pager page={ix} total={pages} setPage={setPage} />
        </div>
        <aside className="detail">
          <div className="detail-head">
            <h2>{g.name}</h2>
            <Btn subtle onClick={() => setHistory(!history)}>
              {history ? '交易详情' : '价格记录'}
            </Btn>
          </div>
          {history ? (
            <TextPages
              text={s.history
                .map(
                  (h) =>
                    `第${h.day}日：买${h.prices[selected].buy} / 卖${h.prices[selected].sell}文。`,
                )
                .join(' ')}
              size={130}
            />
          ) : (
            <>
              <dl className="facts">
                <div>
                  <dt>持有 / 均价成本</dt>
                  <dd>
                    {num(owned)}
                    {g.unit} / {owned ? money(num(cost / owned)) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>保质与临期</dt>
                  <dd>
                    {earliest != null
                      ? `最早第${earliest}日结束时到期${earliest <= s.day ? ' · 今日临期' : ''}`
                      : g.life
                        ? `保存${g.life}日`
                        : '无固定到期日'}
                  </dd>
                </div>
              </dl>
              <label className="quantity">
                交易数量
                <input
                  aria-label={`${g.name}数量`}
                  type="number"
                  min={selected === 'grain' ? '.1' : '1'}
                  step={selected === 'grain' ? '.1' : '1'}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
              <div className="estimate">
                买入 {money(Number.isFinite(q) ? Math.ceil(p.buy * q) : 0)} ·
                卖出 {money(Number.isFinite(q) ? Math.floor(p.sell * q) : 0)}
                <br />
                预计卖出盈亏：
                {q > 0 && q <= owned
                  ? money(
                      Math.floor(p.sell * q) - inventoryCost(s, selected, q),
                    )
                  : '请填写已有数量'}
              </div>
              <div className="actions">
                <Do
                  s={s}
                  act={act}
                  action={{
                    type: 'trade',
                    good: selected,
                    quantity: q,
                    side: 'buy',
                  }}
                >
                  买入
                </Do>
                <Do
                  s={s}
                  act={act}
                  action={{
                    type: 'trade',
                    good: selected,
                    quantity: q,
                    side: 'sell',
                  }}
                >
                  卖出
                </Do>
              </div>
            </>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Production({ s, act }: Props) {
  const [mode, setMode] = useState('配方');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('flour');
  const [count, setCount] = useState('1');
  const queue = s.jobs.filter((j) => j.status === 'queued');
  const items =
    mode === '配方'
      ? RECIPES.map((r) => ({
          id: r.id,
          name: r.name,
          detail: SKILLS[r.industry].name,
        }))
      : mode === '设备'
        ? EQUIPMENT_IDS.map((id) => ({
            id,
            name: EQUIPMENT[id].name,
            detail: s.equipment.find((e) => e.kind === id)?.installed
              ? '已安装'
              : s.equipment.find((e) => e.kind === id)
                ? '已封存'
                : '未购置',
          }))
        : queue.map((j) => ({
            id: String(j.id),
            name: RECIPES.find((r) => r.id === j.recipeId)!.name,
            detail: `${s.equipment.find((e) => e.id === j.equipmentId)?.installed ? '第' + j.readyDay + '日完成' : '封存暂停'}`,
          }));
  const ix = Math.min(page, Math.max(0, Math.ceil(items.length / 5) - 1));
  const id = items.some((x) => x.id === selected)
    ? selected
    : items[ix * 5]?.id;
  const r = RECIPES.find((r) => r.id === id);
  const eq = s.equipment.find((e) => e.kind === id);
  const kind = EQUIPMENT_IDS.find((k) => k === id);
  const job = queue.find((j) => String(j.id) === id);
  const plan = r ? productionPlan(s, r, Number(count)) : null;
  return (
    <Frame title="作坊" note="设备、配方和在制品集中管理。">
      <div className="toolbar">
        {['配方', '设备', '队列'].map((x) => (
          <Btn
            key={x}
            subtle={mode !== x}
            onClick={() => {
              setMode(x);
              setPage(0);
              setSelected('');
            }}
          >
            {x}
            {x === '队列' ? ` (${queue.length})` : ''}
          </Btn>
        ))}
      </div>
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {items.slice(ix * 5, ix * 5 + 5).map((x) => (
              <button
                key={x.id}
                className={`list-item ${x.id === id ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(x.id);
                  setCount('1');
                }}
              >
                <strong>{x.name}</strong>
                <small>{x.detail}</small>
              </button>
            ))}
            {!items.length && <p>没有在制品。当日配方完成后直接入库。</p>}
          </div>
          <Pager
            page={ix}
            total={Math.ceil(items.length / 5)}
            setPage={setPage}
          />
        </div>
        <aside className="detail">
          {mode === '配方' && r && plan && (
            <>
              <h2>{r.name}</h2>
              <p>{r.batchLabel}</p>
              <dl className="facts">
                <div>
                  <dt>所需设备 / 技能</dt>
                  <dd>
                    {EQUIPMENT[r.equipment].name} / {SKILL_LEVELS[r.minSkill]}
                  </dd>
                </div>
                <div>
                  <dt>用时 / 保质期</dt>
                  <dd>
                    {r.duration ? `${r.duration}夜` : '当日'} /{' '}
                    {r.shelfLife ? `${r.shelfLife}日` : '无固定到期日'}
                  </dd>
                </div>
              </dl>
              <label className="quantity">
                加工批量
                <input
                  aria-label={`${r.name}批量`}
                  type="number"
                  min="1"
                  max="20"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
              <p className="estimate">
                本次投入：
                {Object.entries(plan.inputs)
                  .map(([g, u]) => `${GOODS[g as Good].name}${num(u! / 10)}`)
                  .join('、')}
                <br />
                产出：{GOODS[r.output].name}
                {num(plan.outputUnits / 10)}；预计毛利{' '}
                {money(
                  Math.floor(
                    (quote(s, r.output).sell * plan.outputUnits) / 10,
                  ) -
                    Object.entries(plan.inputs).reduce(
                      (a, [g, u]) =>
                        a + Math.ceil((quote(s, g as Good).buy * u!) / 10),
                      0,
                    ),
                )}
                （按现价购料）
              </p>
              <Do
                s={s}
                act={act}
                action={{
                  type: 'produce',
                  recipeId: r.id,
                  quantity: Number(count),
                }}
              >
                开工
              </Do>
            </>
          )}
          {mode === '设备' && kind && (
            <>
              <h2>{EQUIPMENT[kind].name}</h2>
              <p>{EQUIPMENT[kind].detail}</p>
              <p>
                占用1个设备位 · 购置{money(EQUIPMENT[kind].cost)} · 出售
                {money(Math.floor(EQUIPMENT[kind].cost * 0.6))}
              </p>
              {eq?.jobId && (
                <p className="reason">正在加工，请到队列查看或放弃在制品。</p>
              )}
              <div className="actions">
                {eq?.installed ? (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'uninstall', equipmentId: eq.id }}
                  >
                    拆卸封存
                  </Do>
                ) : (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'install', equipment: kind }}
                  >
                    {eq ? '重新安装' : '购置安装'}
                  </Do>
                )}
                {eq && (
                  <Do
                    s={s}
                    act={act}
                    action={{ type: 'sellEquipment', equipmentId: eq.id }}
                  >
                    出售设备
                  </Do>
                )}
              </div>
            </>
          )}
          {mode === '队列' && job && (
            <>
              <h2>{RECIPES.find((r) => r.id === job.recipeId)!.name}</h2>
              <p>
                第{job.startDay}日开工，{job.quantity}批。预计第{job.readyDay}
                日完成，封存期间顺延。
              </p>
              <p>
                已投入{money(job.inputCost)}，预留{job.outputUnits / 10}份仓储。
              </p>
              <Do
                s={s}
                act={act}
                action={{ type: 'cancelProduction', jobId: job.id }}
              >
                放弃这批生产
              </Do>
              <small>原料不返还，设备随即空闲。</small>
            </>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Housing({ s, act }: Props) {
  const [id, setId] = useState(s.housing.id);
  const h = HOUSING[id];
  return (
    <Frame
      title="安居与经营"
      note={`当前${HOUSING[s.housing.id].name} · 设备${s.equipment.filter((e) => e.installed).length}/${HOUSING[s.housing.id].slots} · 养鸡${s.hens.length}/${henCapacity(s)}`}
    >
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {HOUSING_IDS.map((x) => (
              <button
                key={x}
                className={`list-item ${id === x ? 'selected' : ''}`}
                onClick={() => setId(x)}
              >
                <strong>{HOUSING[x].name}</strong>
                <small>
                  {x === s.housing.id
                    ? '当前住所'
                    : HOUSING[x].kind === 'owned'
                      ? `购买${money(HOUSING[x].cost)}`
                      : HOUSING[x].kind === 'rent'
                        ? `接手${money(HOUSING[x].cost)}`
                        : '免费临时落脚'}
                </small>
              </button>
            ))}
          </div>
        </div>
        <aside className="detail">
          <h2>{h.name}</h2>
          <p>{h.detail}</p>
          <dl className="facts">
            <div>
              <dt>仓储 / 设备位</dt>
              <dd>
                {h.capacity / 10}份 / {h.slots}台
              </dd>
            </div>
            <div>
              <dt>夜间费用 / 恢复</dt>
              <dd>
                {money(h.upkeep)} / {h.recovery}体力
              </dd>
            </div>
            <div>
              <dt>养鸡上限（需鸡舍）</dt>
              <dd>{h.henCapacity}只</dd>
            </div>
          </dl>
          <div className="actions">
            {id !== s.housing.id && id !== 'street' && (
              <Do
                s={s}
                act={act}
                action={{
                  type: h.kind === 'owned' ? 'buyHousing' : 'rentHousing',
                  housing: id,
                }}
              >
                {h.kind === 'owned' ? '买下' : '租下'}
              </Do>
            )}
            {HOUSING[s.housing.id].kind === 'rent' && (
              <Do s={s} act={act} action={{ type: 'endLease' }}>
                退租并封存设备
              </Do>
            )}
            {HOUSING[s.housing.id].kind === 'owned' && (
              <Do s={s} act={act} action={{ type: 'sellHousing' }}>
                出售产权 ·{' '}
                {money(Math.floor(HOUSING[s.housing.id].cost * 0.72))}
              </Do>
            )}
            {s.housing.maintenanceSuspended && (
              <Do s={s} act={act} action={{ type: 'maintain' }}>
                补缴维护费
              </Do>
            )}
          </div>
          <small>
            搬家不销毁资产。退租后在制品暂停，超额库存可继续卖出；迁入新住所前需满足容量限制。
          </small>
        </aside>
      </div>
    </Frame>
  );
}
function People({ s, act }: Props) {
  const [id, setId] = useState('身体');
  const skill = SKILL_IDS.find((k) => k === id);
  return (
    <Frame
      title="人物与手艺"
      note="每日劳动两次；休息、加餐、治疗、上课各一次。"
    >
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            <button
              className={`list-item ${id === '身体' ? 'selected' : ''}`}
              onClick={() => setId('身体')}
            >
              <strong>饮食、休养与劳动</strong>
              <small>
                健康{s.health} · 体力{s.stamina}
              </small>
            </button>
            {SKILL_IDS.map((k) => (
              <button
                key={k}
                className={`list-item ${id === k ? 'selected' : ''}`}
                onClick={() => setId(k)}
              >
                <strong>{SKILLS[k].name}</strong>
                <small>
                  {SKILL_LEVELS[s.skills[k]]} · {s.skillXp[k]}批经验
                </small>
              </button>
            ))}
          </div>
        </div>
        <aside className="detail">
          {skill ? (
            <>
              <h2>{SKILLS[skill].name}</h2>
              <p>
                {SKILLS[skill].teacher}：{SKILLS[skill].detail}
              </p>
              <p>
                当前{SKILL_LEVELS[s.skills[skill]]} · 经验{s.skillXp[skill]}批
              </p>
              {s.skills[skill] < 3 && (
                <p>
                  下一阶需{XP_TO_LEVEL[s.skills[skill] + 1]}
                  批经验（入门无需经验），学费
                  {money(LESSON_COST[s.skills[skill]])}。
                </p>
              )}
              <Do s={s} act={act} action={{ type: 'learn', skill }}>
                学习
                {s.skills[skill] < 3
                  ? ` · ${money(LESSON_COST[s.skills[skill]])}`
                  : ''}
              </Do>
            </>
          ) : (
            <>
              <h2>照料自己</h2>
              <div className="care-grid">
                <Do s={s} act={act} action={{ type: 'short' }}>
                  短工 · 25文
                </Do>
                <Do s={s} act={act} action={{ type: 'heavy' }}>
                  重活 · 40文
                </Do>
                <Do s={s} act={act} action={{ type: 'rest' }}>
                  休息 · 恢复25体力
                </Do>
                <Do s={s} act={act} action={{ type: 'snack' }}>
                  加餐 · 6文 / +15体力
                </Do>
                <Do s={s} act={act} action={{ type: 'treat', mode: 'slow' }}>
                  调养 · 30文 / +10健康
                </Do>
                <Do s={s} act={act} action={{ type: 'treat', mode: 'fast' }}>
                  快速治疗 · 80文+药材
                </Do>
              </div>
              <small>
                快速治疗恢复25健康。两种治疗均解除风寒；劳累时劳动多耗5体力。
              </small>
            </>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Intel({ s, act }: Props) {
  const [category, setCategory] = useState('全部');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const entries = s.intel.filter(
    (i) => category === '全部' || i.category === category,
  );
  const ix = Math.min(page, Math.max(0, Math.ceil(entries.length / 4) - 1));
  const i = entries.find((i) => i.id === selected) ?? entries[ix * 4];
  return (
    <Frame
      title="茶馆与市井"
      note="问清出处，过几日回访：街巷里的消息未必都能兑现。"
    >
      <div className="toolbar">
        <Do s={s} act={act} action={{ type: 'tea' }}>
          茶馆听消息 · 8文
        </Do>
        <label>
          题材{' '}
          <select
            aria-label="情报分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
              setSelected('');
            }}
          >
            {['全部', ...new Set(s.intel.map((i) => i.category))].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {entries.slice(ix * 4, ix * 4 + 4).map((e) => (
              <button
                key={e.id}
                className={`list-item ${i?.id === e.id ? 'selected' : ''}`}
                onClick={() => setSelected(e.id)}
              >
                <span>
                  <strong>{e.title ?? `${e.category} · ${e.source}`}</strong>
                  <small>
                    {e.source} · 第{e.heardDay}日 ·{' '}
                    {e.worldId ? '行情线索' : '市井见闻'}
                  </small>
                </span>
                <small>
                  {e.status === 'new'
                    ? '待验证'
                    : e.status === 'confirmed'
                      ? '已有后续'
                      : e.status === 'wrong'
                        ? '未兑现'
                        : '已过期'}
                </small>
              </button>
            ))}
            {!entries.length && (
              <p>还没有这一类消息。每天可在茶馆听取三条不同题材的内容。</p>
            )}
          </div>
          <Pager
            page={ix}
            total={Math.ceil(entries.length / 4)}
            setPage={(v) => {
              setPage(v);
              setSelected('');
            }}
          />
        </div>
        <aside className="detail">
          {i ? (
            <>
              <h2>{i.source}的消息</h2>
              <TextPages
                key={i.id}
                text={i.text + (i.followUp ? `\n核对：${i.followUp}` : '')}
                size={160}
              />
              <div className="actions">
                <Do s={s} act={act} action={{ type: 'askIntel', id: i.id }}>
                  追问出处
                </Do>
                <Do s={s} act={act} action={{ type: 'visitIntel', id: i.id }}>
                  回访核对
                </Do>
              </div>
            </>
          ) : (
            <p>选一条消息查看全文及后续。</p>
          )}
        </aside>
      </div>
    </Frame>
  );
}
function Assets({ s }: Props) {
  const [category, setCategory] = useState('货物');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const goods = GOOD_IDS.filter((g) => quantity(s, g) > 0);
  const rows =
    category === '货物'
      ? goods.map((g) => ({
          id: g,
          name: GOODS[g].name,
          summary: `${num(quantity(s, g))}${GOODS[g].unit}`,
          value: Math.floor(quantity(s, g) * quote(s, g).sell),
        }))
      : category === '在制品'
        ? s.jobs
            .filter((j) => j.status === 'queued')
            .map((j) => ({
              id: String(j.id),
              name: RECIPES.find((r) => r.id === j.recipeId)!.name,
              summary: `${j.quantity}批 · 第${j.readyDay}日预计完成`,
              value: j.inputCost,
            }))
        : category === '设备'
          ? s.equipment.map((e) => ({
              id: String(e.id),
              name: EQUIPMENT[e.kind].name,
              summary: e.jobId ? '生产中' : e.installed ? '已安装' : '封存中',
              value: Math.floor(EQUIPMENT[e.kind].cost * 0.6),
            }))
          : HOUSING[s.housing.id].kind === 'owned'
            ? [
                {
                  id: s.housing.id,
                  name: HOUSING[s.housing.id].name,
                  summary: '自有产权',
                  value: Math.floor(HOUSING[s.housing.id].cost * 0.72),
                },
              ]
            : [];
  const index = Math.min(page, Math.max(0, Math.ceil(rows.length / 4) - 1));
  const chosen = rows.find((r) => r.id === selected) ?? rows[index * 4];
  const good = category === '货物' && chosen ? (chosen.id as Good) : null;
  const eq =
    category === '设备'
      ? s.equipment.find((e) => String(e.id) === chosen?.id)
      : null;
  const job =
    category === '在制品'
      ? s.jobs.find((j) => String(j.id) === chosen?.id)
      : null;
  const goodsValue = goods.reduce(
    (v, g) => v + Math.floor(quantity(s, g) * quote(s, g).sell),
    0,
  );
  const equipmentValue = s.equipment.reduce(
    (v, e) => v + Math.floor(EQUIPMENT[e.kind].cost * 0.6),
    0,
  );
  const propertyValue =
    HOUSING[s.housing.id].kind === 'owned'
      ? Math.floor(HOUSING[s.housing.id].cost * 0.72)
      : 0;
  return (
    <Frame
      title="我的资产"
      note={`现金 ${money(s.cash)} · 货物估值 ${money(goodsValue)} · 设备/房产回收价 ${money(equipmentValue + propertyValue)}`}
    >
      <div className="toolbar">
        {['货物', '在制品', '设备', '房产'].map((c) => (
          <Btn
            key={c}
            subtle={category !== c}
            onClick={() => {
              setCategory(c);
              setPage(0);
              setSelected('');
            }}
          >
            {c}
          </Btn>
        ))}
      </div>
      <div className="split">
        <div className="list-column">
          <div className="item-list">
            {rows.slice(index * 4, index * 4 + 4).map((r) => (
              <button
                key={r.id}
                className={`list-item ${chosen?.id === r.id ? 'selected' : ''}`}
                onClick={() => setSelected(r.id)}
              >
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.summary}</small>
                </span>
                <span>{money(r.value)}</span>
              </button>
            ))}
            {!rows.length && (
              <p>
                暂无{category}。
                {category === '房产'
                  ? `当前${HOUSING[s.housing.id].name}，没有可出售的产权。`
                  : ''}
              </p>
            )}
          </div>
          <Pager
            page={index}
            total={Math.ceil(rows.length / 4)}
            setPage={(v) => {
              setPage(v);
              setSelected('');
            }}
          />
        </div>
        <aside className="detail">
          <h2>{chosen?.name ?? '资产说明'}</h2>
          {good && (
            <>
              <dl className="facts">
                <div>
                  <dt>持有数量 / 成本总额</dt>
                  <dd>
                    {num(quantity(s, good))}
                    {GOODS[good].unit} / {money(inventoryCost(s, good))}
                  </dd>
                </div>
                <div>
                  <dt>参考卖价 / 预计盈亏</dt>
                  <dd>
                    {money(quote(s, good).sell)} /{' '}
                    {money(chosen!.value - inventoryCost(s, good))}
                  </dd>
                </div>
              </dl>
              <TextPages
                key={good}
                size={140}
                text={
                  good === 'hen'
                    ? s.hens
                        .map(
                          (h, i) =>
                            `第${i + 1}只：成本${h.cost}文，连续${h.hunger}夜未喂。`,
                        )
                        .join('\n')
                    : s.batches
                        .filter((b) => b.good === good)
                        .map(
                          (b) =>
                            `${num(b.units / 10)}${GOODS[good].unit}，成本${money(b.cost)}，${b.origin === 'buy' ? '购入' : b.origin === 'production' ? '自产' : '获赠'}；${b.expires === null ? '无固定到期日' : `第${b.expires}日结束时到期${b.expires <= s.day ? '（临期）' : ''}`}。`,
                        )
                        .join('\n')
                }
              />
            </>
          )}
          {eq && (
            <p>
              {eq.installed
                ? '已安装，占用1个设备位。'
                : '已封存，可在生产页重装。'}
              {eq.jobId ? '在制品需先完成或放弃，才能出售设备。' : ''}购置价
              {money(EQUIPMENT[eq.kind].cost)}，固定回收价{money(chosen!.value)}
              。
            </p>
          )}
          {job && (
            <p>
              投入成本{money(job.inputCost)}，成品预留{job.outputUnits / 10}
              份仓储。第{job.startDay}日开工；
              {s.equipment.find((e) => e.id === job.equipmentId)?.installed
                ? '正常加工'
                : '设备封存，生产暂停'}
              。在制品尚不能出售。
            </p>
          )}
          {category === '房产' && chosen && (
            <p>
              产权参考回收价{money(chosen.value)}
              。出售条件和维护情况请到住宅页查看。
            </p>
          )}
          <small>
            货物按当前市场卖价估值；在制品单独列投入成本，不计入可变现合计。设备和产权实际出售仍须满足操作条件。
          </small>
          <p>
            参考可变现合计：
            <strong>
              {money(s.cash + goodsValue + equipmentValue + propertyValue)}
            </strong>
          </p>
        </aside>
      </div>
    </Frame>
  );
}
function StatusEffects({ s }: { s: GameState }) {
  const [page, setPage] = useState(0);
  const effects = Object.keys(BUFFS)
    .filter((k) => active(s, k as keyof typeof BUFFS))
    .map((k) => {
      const b = BUFFS[k as keyof typeof BUFFS];
      return { name: b.name, detail: b.detail };
    });
  if (s.housing.maintenanceSuspended)
    effects.push({
      name: '维护暂停',
      detail: '住宅恢复加成和新开工暂停，补缴后恢复。',
    });
  const index = Math.min(page, Math.max(0, effects.length - 1));
  return (
    <div className="status-effects">
      <span>
        当前状态{effects.length > 1 ? ` · ${index + 1}/${effects.length}` : ''}
      </span>
      <strong>{effects[index]?.name ?? '平稳'}</strong>
      <small>{effects[index]?.detail ?? '没有额外状态影响。'}</small>
      {effects.length > 1 && (
        <div className="effect-controls">
          <button
            aria-label="上一个状态"
            onClick={() =>
              setPage((index + effects.length - 1) % effects.length)
            }
          >
            ‹
          </button>
          <button
            aria-label="下一个状态"
            onClick={() => setPage((index + 1) % effects.length)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function Ledger({ s }: Props) {
  const [page, setPage] = useState(0);
  const l = s.ledger;
  const logs = [...s.logs].reverse();
  const ix = Math.min(page, Math.max(0, Math.ceil(logs.length / 3) - 1));
  return (
    <Frame
      title="账本"
      note={`修正分类账从第${l.sinceDay}日起记录；现金流与毛利分开。`}
    >
      <div className="split">
        <div className="ledger-grid">
          {[
            ['贸易毛利', l.tradeRevenue - l.tradeCost],
            ['生产毛利', l.productionRevenue - l.productionCost],
            ['采购支出', l.purchases],
            ['劳动收入', l.workIncome],
            ['学费', l.tuition],
            ['设备 / 回收', `${money(l.equipment)} / ${money(l.returns)}`],
            ['住宅 / 生活', `${money(l.housing)} / ${money(l.living)}`],
            ['饲料 / 医疗', `${money(l.feed)} / ${money(l.medical)}`],
            ['损耗', l.losses],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{typeof v === 'number' ? money(v) : v}</strong>
            </div>
          ))}
        </div>
        <aside className="detail">
          <h2>近期流水</h2>
          <div className="log-list">
            {logs.slice(ix * 3, ix * 3 + 3).map((x) => (
              <div className="log" key={x.id}>
                <small>
                  第{x.day}日 {x.cash ? money(x.cash) : ''}
                </small>
                <TextPages
                  text={x.text + (x.items ? ' ' + x.items : '')}
                  size={65}
                />
              </div>
            ))}
          </div>
          <Pager
            page={ix}
            total={Math.ceil(logs.length / 3)}
            setPage={setPage}
          />
        </aside>
      </div>
    </Frame>
  );
}
function Night({ s, act }: Props) {
  const [meal, setMeal] = useState<Meal>(
    quantity(s, 'bread') >= 1 ? 'bread' : 'diner',
  );
  const [bed, setBed] = useState<Bed>(
    s.housing.id === 'street' ? 'inn' : s.housing.id,
  );
  const [feed, setFeed] = useState(String(s.hens.length));
  let p;
  let error = '';
  try {
    p = nightPreview(s, { type: 'night', meal, bed, feed: Number(feed) });
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <Frame title="安排今晚" note="晚饭、饲料与住宅费用合并核算，再一次结算。">
      <div className="split">
        <div className="night-inputs">
          <label>
            晚饭
            <select
              aria-label="晚饭"
              value={meal}
              onChange={(e) => setMeal(e.target.value as Meal)}
            >
              {[
                ['bread', '炊饼一个'],
                ['egg', '鸡蛋两枚'],
                ['saltedEgg', '咸蛋一个'],
                ['grain', '粟米一份'],
                ['diner', '食肆 · 18文'],
                ['none', '不吃 · 健康−8'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            住宿
            <select
              aria-label="住宿"
              value={bed}
              onChange={(e) => setBed(e.target.value as Bed)}
            >
              {[
                ['inn', '客栈 · 30文'],
                ['temple', '庙廊 · 免费 / 有失窃风险'],
                ['street', '街头 · 免费 / 健康−3'],
                ...(s.housing.id !== 'street'
                  ? [[s.housing.id, HOUSING[s.housing.id].name]]
                  : []),
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            喂鸡数量
            <input
              aria-label="喂鸡数量"
              type="number"
              min="0"
              max={s.hens.length}
              value={feed}
              onChange={(e) => setFeed(e.target.value)}
            />
          </label>
          <small>
            当前{s.hens.length}
            只母鸡。未喂满三夜会饿死；另住客栈仍需支付现有住宅费用。
          </small>
        </div>
        <aside className="detail">
          <h2>今晚的账</h2>
          {p ? (
            <>
              <dl className="facts">
                <div>
                  <dt>晚饭 / 临时住宿</dt>
                  <dd>
                    {money(p.mealCost)} / {money(p.innCost)}
                  </dd>
                </div>
                <div>
                  <dt>租金或维护费</dt>
                  <dd>{money(p.housingCost)}</dd>
                </div>
                <div>
                  <dt>现金合计 / 粟米共用</dt>
                  <dd>
                    {money(p.cash)} / {p.grain}份
                  </dd>
                </div>
                <div>
                  <dt>健康变化 / 次日体力</dt>
                  <dd>
                    {p.healthChange >= 0 ? '+' : ''}
                    {p.healthChange} / {p.recovery}
                  </dd>
                </div>
              </dl>
              <p>
                {p.food} · {p.unfed.length}只鸡未喂
              </p>
              {(p.evict || p.maintenanceSkipped) && (
                <p className="reason">
                  {p.evict
                    ? '无法付租：将退回街头，设备封存。'
                    : '无法维护：恢复加成与生产暂停。'}
                </p>
              )}
            </>
          ) : (
            <p className="reason">{error}</p>
          )}
          <Do
            s={s}
            act={act}
            action={{ type: 'night', meal, bed, feed: Number(feed) }}
          >
            安排妥当，度过这一夜 →
          </Do>
        </aside>
      </div>
    </Frame>
  );
}
function Encounter({ s, act }: Props) {
  const [page, setPage] = useState(0);
  const e = s.event!;
  const c = e.choices[Math.min(page, e.choices.length - 1)];
  return (
    <Frame title={e.title} note="先读经过和线索，再选择如何回应。">
      <div className="split">
        <div className="detail">
          <TextPages
            text={
              e.text +
              '\n线索：' +
              e.clue +
              (e.inspected ? '\n查问：' + e.inspection : '')
            }
            size={170}
          />
          <Do s={s} act={act} action={{ type: 'inspect' }}>
            向附近人查问 · 5文
          </Do>
        </div>
        <aside className="detail">
          <h2>你的回应</h2>
          <TextPages text={c.hint} size={100} />
          <p>现金消耗 {money(c.cost.cash ?? 0)}</p>
          <Do
            s={s}
            act={act}
            action={{ type: 'choice', id: c.id, eventId: e.id }}
          >
            {c.label}
          </Do>
          <Pager page={page} total={e.choices.length} setPage={setPage} />
        </aside>
      </div>
    </Frame>
  );
}
export default function Home() {
  const [s, setS] = useState<GameState | null>(null);
  const ref = useRef<GameState | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rawExists, setRawExists] = useState(false);
  const [oldKeys, setOldKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [storageError, setStorageError] = useState('');
  const [tab, setTab] = useState<Tab>('market');
  const [restart, setRestart] = useState<3000 | 30000 | null>(null);
  const [pending, setPending] = useState<{
    action: Action;
    revision: number;
    message: string;
  } | null>(null);
  const save = (next: GameState) => {
    ref.current = next;
    setS(next);
    setRawExists(true);
    try {
      const previous = localStorage.getItem(SAVE);
      const backupKey = `${SAVE}-before-20260910`;
      if (
        previous &&
        !previous.includes('"purchases":') &&
        !localStorage.getItem(backupKey)
      ) {
        localStorage.setItem(backupKey, previous);
        setOldKeys((keys) => [...new Set([...keys, backupKey])]);
      }
      localStorage.setItem(SAVE, JSON.stringify(next));
    } catch {
      setStorageError('无法自动保存，请导出当前存档再关闭页面。');
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(SAVE);
        setRawExists(!!raw);
        setOldKeys(
          Object.keys(localStorage).filter(
            (k) => /bianliang.*save|save.*bianliang/.test(k) && k !== SAVE,
          ),
        );
        if (raw) setSaved(readSave(raw));
      } catch (e) {
        setStorageError((e as Error).message);
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(
    () =>
      registerGameTools(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => ref.current,
        (a, r) => {
          if (!ref.current) return { error: '请先开始游戏' };
          const result = dispatch(ref.current, a, r);
          if (result.error) {
            setError(result.error);
            setFeedback(`操作未执行：${result.error}`);
            return { error: result.error };
          }
          setError('');
          setFeedback(result.state.lastResponse ?? result.state.story);
          save(result.state);
          return {};
        },
      ),
    [],
  );
  const execute = (a: Action, revision = ref.current?.revision) => {
    if (!ref.current) return;
    const r = dispatch(ref.current, a, revision);
    if (r.error) {
      setError(r.error);
      setFeedback(`操作未执行：${r.error}`);
    } else {
      setError('');
      setFeedback(r.state.lastResponse ?? r.state.story);
      save(r.state);
    }
    setPending(null);
  };
  const act: Act = (a) => {
    if (!ref.current) return;
    const p = actionPreview(ref.current, a);
    const destructive = [
      'cancelProduction',
      'endLease',
      'sellHousing',
      'sellEquipment',
    ].includes(a.type);
    if (!p.error && (p.warning || destructive))
      setPending({
        action: a,
        revision: ref.current.revision,
        message:
          p.warning ||
          '此操作会出售资产或暂停经营；放弃生产不退原料，退租不退租金。',
      });
    else execute(a);
  };
  const start = (target: 3000 | 30000) => {
    save(newGame(crypto.getRandomValues(new Uint32Array(1))[0], target));
    setRestart(null);
    setError('');
    setStorageError('');
    setSaved(null);
    setTab('market');
    setFeedback('新旅程已开始，带着800文走进汴梁。');
  };
  const requestStart = (target: 3000 | 30000) => {
    if (rawExists || s) setRestart(target);
    else start(target);
  };
  const download = (key = SAVE) => {
    const raw =
      key === SAVE && ref.current
        ? JSON.stringify(ref.current)
        : localStorage.getItem(key);
    if (!raw) {
      setError('没有可导出的存档');
      return;
    }
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${key}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className={`game ${s ? 'playing' : 'welcome'}`}>
      <header className="masthead">
        <div className="brand">
          <span className="seal">宋</span>汴梁归途 <small>长期经营手记</small>
        </div>
        <div className="toolbar">
          {(rawExists || s) && (
            <Btn subtle onClick={() => download()}>
              导出存档
            </Btn>
          )}
          {oldKeys.map((k) => (
            <Btn key={k} subtle onClick={() => download(k)}>
              {k.includes('before-20260910')
                ? '导出修复前备份'
                : '导出旧版存档'}
            </Btn>
          ))}
          {s && (
            <Btn subtle onClick={() => requestStart(s.target)}>
              重新开始
            </Btn>
          )}
        </div>
      </header>
      {!s ? (
        <section className="opening">
          <p>崇宁二年 · 东京城外</p>
          <h1>
            城门开了。
            <br />
            你的归途，还很远。
          </h1>
          <p>八百文起步，经营没有期限。看行情，学手艺，安置一间自己的作坊。</p>
          <div className="watch">只认现金 · 三千文归航 / 三万文长途</div>
          {storageError && <p className="reason">{storageError}</p>}
          <div className="actions">
            {saved && (
              <Btn
                onClick={() => {
                  ref.current = saved;
                  setS(saved);
                }}
              >
                继续第{saved.day}日 · {money(saved.cash)}
              </Btn>
            )}
            <Btn disabled={!loaded} onClick={() => requestStart(3000)}>
              走进汴梁 · 3000文
            </Btn>
            <Btn disabled={!loaded} subtle onClick={() => requestStart(30000)}>
              挑战三万文
            </Btn>
          </div>
          <small>新局会在确认后替换当前进度；旧版存档单独保留。</small>
        </section>
      ) : (
        <>
          <section className="status">
            <div>
              <span>
                第{s.day}日 · {s.weather}
              </span>
              <strong>
                {s.phase === 'night'
                  ? '夜间安排'
                  : s.phase === 'ended'
                    ? '旅程结束'
                    : '经营日'}
              </strong>
            </div>
            <div>
              <span>现金 / 目标</span>
              <strong>
                {money(s.cash)} / {money(s.target)}
              </strong>
              <progress max={s.target} value={s.cash} />
            </div>
            <div>
              <span>健康 / 体力</span>
              <strong>
                {s.health} / {s.stamina}
                <small>体力上限{staminaMax(s)}</small>
              </strong>
            </div>
            <div>
              <span>{HOUSING[s.housing.id].name} · 仓储</span>
              <strong>
                {num(occupied(s) / 10)} / {capacity(s) / 10}
                <small>在制预留{num((reserved(s) - occupied(s)) / 10)}</small>
              </strong>
            </div>
            <StatusEffects s={s} />
            <div
              className="operation-feedback"
              aria-live="polite"
              aria-atomic="true"
            >
              <span>操作响应</span>
              <TextPages
                key={feedback || s.lastResponse || s.story}
                text={feedback || s.lastResponse || s.story}
                size={40}
              />
            </div>
          </section>
          <nav className="workspaces" aria-label="经营工作区">
            {Object.entries(tabs).map(([id, label]) => (
              <button
                key={id}
                disabled={
                  !!s.event || s.phase === 'night' || s.phase === 'ended'
                }
                aria-current={tab === id ? 'page' : undefined}
                className={tab === id ? 'active' : ''}
                onClick={() => {
                  setTab(id as Tab);
                  setError('');
                  setFeedback(`已打开${label}。`);
                }}
              >
                {label}
              </button>
            ))}
            {s.phase === 'market' && tab !== 'market' && (
              <Btn subtle onClick={() => execute({ type: 'leave' })}>
                离开市场
              </Btn>
            )}
          </nav>
          <div className="workspace">
            {s.phase === 'ended' ? (
              <Frame
                title={s.ending === 'return' ? '归去来兮' : '旅程终章'}
                note={`经营${s.stats.days}日 · ${s.deathCause || '归航的光亮起了。'}`}
              >
                <div className="split">
                  <div className="detail">
                    <h2>这一程的收获</h2>
                    <p>
                      生产{s.stats.productionRuns}批 · 产蛋{s.stats.eggs}枚 ·
                      交易{s.stats.trades}次
                    </p>
                    <p>最高流动资产{money(s.stats.peakAssets)}</p>
                    <TextPages
                      text={
                        achievements(s)
                          .filter(([, ok]) => ok)
                          .map(([name]) => name)
                          .join(' · ') || '每一步都记在手记里。'
                      }
                    />
                  </div>
                  <aside className="detail">
                    <TextPages text={s.story} />
                    <Btn onClick={() => requestStart(s.target)}>再走一程</Btn>
                  </aside>
                </div>
              </Frame>
            ) : s.event ? (
              <Encounter key={s.event.id} s={s} act={act} />
            ) : s.phase === 'night' ? (
              <Night s={s} act={act} />
            ) : tab === 'market' ? (
              <Market s={s} act={act} />
            ) : tab === 'assets' ? (
              <Assets s={s} act={act} />
            ) : tab === 'production' ? (
              <Production s={s} act={act} />
            ) : tab === 'housing' ? (
              <Housing s={s} act={act} />
            ) : tab === 'people' ? (
              <People s={s} act={act} />
            ) : tab === 'intel' ? (
              <Intel s={s} act={act} />
            ) : (
              <Ledger s={s} act={act} />
            )}
          </div>
          <footer className="bottom-bar">
            <div className="latest" aria-live="polite">
              <small>{error || storageError ? '提示' : '最新手记'}</small>
              <TextPages
                key={error || storageError || s.story}
                text={error || storageError || s.story}
                size={65}
              />
            </div>
            <div className="actions">
              {!s.event && s.phase !== 'ended' && s.cash >= s.target && (
                <Do s={s} act={act} action={{ type: 'return' }}>
                  支付{money(s.target)}归航
                </Do>
              )}
              {!s.event && ['day', 'market'].includes(s.phase) && (
                <Btn
                  onClick={() =>
                    s.phase === 'market'
                      ? execute({ type: 'leave' })
                      : act({ type: 'endDay' })
                  }
                >
                  {s.phase === 'market'
                    ? '离开市场，返回街巷'
                    : '收工，安排今晚 →'}
                </Btn>
              )}
            </div>
          </footer>
        </>
      )}
      <Dialog
        open={restart !== null}
        onOpenChange={(open) => {
          if (!open) setRestart(null);
        }}
      >
        <DialogContent className="confirm" showCloseButton={false}>
          <DialogTitle>重新走进汴梁？</DialogTitle>
          <DialogDescription>
            新目标：{restart === 30000 ? '三万文' : '三千文'}
            。开始新局会覆盖当前存档，请先导出需要保留的进度。
          </DialogDescription>
          <div className="actions">
            <Btn subtle onClick={() => setRestart(null)}>
              保留当前旅程
            </Btn>
            <Btn onClick={() => restart && start(restart)}>开始新局</Btn>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="confirm" showCloseButton={false}>
          <DialogTitle>确认这次安排</DialogTitle>
          <DialogDescription>{pending?.message}</DialogDescription>
          <div className="actions">
            <Btn subtle onClick={() => setPending(null)}>
              返回调整
            </Btn>
            <Btn
              onClick={() =>
                pending && execute(pending.action, pending.revision)
              }
            >
              确认执行
            </Btn>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
