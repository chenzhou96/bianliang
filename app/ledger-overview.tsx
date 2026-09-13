import Image from 'next/image';
import { recentCash } from '../lib/game/ledger.ts';
import type { GameState } from '../lib/game/types.ts';

const cash = (n: number) => `${n.toLocaleString('zh-CN')}文`;
const compact = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}万` : `${n}`;

export function LedgerOverview({ s }: { s: GameState }) {
  const l = s.ledger;
  const days = recentCash(s);
  const income = days.reduce((n, d) => n + d.income, 0);
  const expense = days.reduce((n, d) => n + d.expense, 0);
  const peak = Math.max(2, ...days.flatMap((d) => [d.income, d.expense]));
  const groups: { title: string; note: string; rows: [string, number][] }[] = [
    {
      title: '赚在哪里',
      note: `第${l.sinceDay}日起累计 · 毛利已扣已售货物成本`,
      rows: [
        ['贸易毛利', l.tradeRevenue - l.tradeCost],
        ['生产毛利', l.productionRevenue - l.productionCost],
        ['劳动收入', l.workIncome],
      ],
    },
    {
      title: '花在哪里',
      note: '累计投入与开销 · 进货和购置资产不等于亏损',
      rows: [
        ['采购（含进货运费）', l.purchases],
        ['住宅 / 设备投入', l.housing + l.equipment],
        ['饮食与住宿', l.living],
        ['学艺 / 交际', l.tuition + l.social],
        ['行情奔走 / 罚款', s.marketControl.expenses + s.marketControl.fines],
        ['饲料 / 医疗', l.feed + l.medical],
        ['货物损耗 / 违约', l.losses + l.depositLosses],
      ],
    },
  ];
  return (
    <div className="ledger-overview">
      <Image
        className="ledger-illustration"
        src="/art/scenes/ledger-v1.webp"
        alt=""
        width={1440}
        height={811}
        unoptimized
      />
      <section className="cash-overview" aria-labelledby="cash-heading">
        <header className="cash-heading">
          <div>
            <small>经营概览</small>
            <h2 id="cash-heading">近七日收支</h2>
          </div>
          <span>
            第{days[0].day}—{s.day}日 · 今日尚未结束
          </span>
        </header>
        <div className="cash-totals">
          <div>
            <span>现金流入</span>
            <strong>{cash(income)}</strong>
          </div>
          <div>
            <span>现金流出</span>
            <strong>{cash(expense)}</strong>
          </div>
          <div>
            <span>净收支</span>
            <strong className={income < expense ? 'cash-negative' : ''}>
              {income > expense ? '+' : ''}
              {cash(income - expense)}
            </strong>
          </div>
        </div>
        <figure className="cash-chart">
          <div className="cash-legend">
            <span>● 流入</span>
            <span>▧ 流出</span>
            <small>单位：文</small>
          </div>
          <div className="cash-plot">
            {days.map((d) => (
              <div className="cash-day" key={d.day}>
                <div className="cash-bar-group">
                  <div
                    className="cash-bar cash-in"
                    style={{ height: `${(d.income / peak) * 100}%` }}
                    title={`流入${cash(d.income)}`}
                  >
                    <span>{compact(d.income)}</span>
                  </div>
                  <div
                    className="cash-bar cash-out"
                    style={{ height: `${(d.expense / peak) * 100}%` }}
                    title={`流出${cash(d.expense)}`}
                  >
                    <span>{compact(d.expense)}</span>
                  </div>
                </div>
                <small>{d.day === s.day ? '今日' : `第${d.day}日`}</small>
              </div>
            ))}
          </div>
          <div className="cash-mobile-days">
            {days.map((d) => (
              <div key={d.day}>
                <b>{d.day === s.day ? '今日' : `第${d.day}日`}</b>
                <span>+{cash(d.income)}</span>
                <span>−{cash(d.expense)}</span>
              </div>
            ))}
          </div>
          <figcaption>
            {income === 0 && expense === 0
              ? '这几日还没有现金来往，开张后这里会逐日记下收支。'
              : '按实际结算日记录；保证金缴付与返还计入收支，库存耗用不重复计入。'}
          </figcaption>
        </figure>
      </section>
      <div className="ledger-summaries">
        {groups.map((group) => (
          <section className="ledger-summary" key={group.title}>
            <h3>{group.title}</h3>
            <p>{group.note}</p>
            <dl>
              {group.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={value < 0 ? 'cash-negative' : ''}>
                    {cash(value)}
                  </dd>
                </div>
              ))}
            </dl>
            {group.title === '赚在哪里' && (
              <p className="ledger-footnote">
                资产回收 {cash(l.returns)} · 保证金返还{' '}
                {cash(l.depositsReturned)}
                <br />
                这些是现金回流，不计作经营毛利。
              </p>
            )}
            {group.title === '花在哪里' && (
              <p className="ledger-footnote">
                冻结保证金{' '}
                {cash(
                  s.commerce.orders
                    .filter((o) => o.status === 'accepted')
                    .reduce((n, o) => n + o.deposit, 0),
                )}{' '}
                · 累计缴付 {cash(l.depositsPaid)}
                <br />
                饮食含自备食材成本，损耗按货物成本计。
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
