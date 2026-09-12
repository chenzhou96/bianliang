// Desktop permits vertical scrolling only inside the operation area and record feed.
export async function measureLayout(page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    pageWidth: document.documentElement.scrollWidth,
    bad: [...document.querySelectorAll('main *, [role=dialog] *')]
      .filter((e) => {
        const r = e.getBoundingClientRect(),
          c = getComputedStyle(e);
        if (
          !r.width ||
          !r.height ||
          e.matches('.sr-only,.record-announcement') ||
          ['INPUT', 'SELECT', 'PROGRESS'].includes(e.tagName)
        )
          return false;
        const vertical = e.scrollHeight > e.clientHeight + 2;
        const allowed =
          !e.closest('.asset-rail,.status') && /auto|scroll/.test(c.overflowY);
        return e.scrollWidth > e.clientWidth + 2 || (vertical && !allowed);
      })
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        scroll: [e.scrollWidth, e.scrollHeight],
        client: [e.clientWidth, e.clientHeight],
      })),
    assets: [...document.querySelectorAll('.fixed-assets section')].map(
      (e) => ({ bottom: e.getBoundingClientRect().bottom }),
    ),
    assetBottom: document
      .querySelector('.asset-summary')
      ?.getBoundingClientRect().top,
    center: document
      .querySelector('.work-column')
      ?.getBoundingClientRect()
      .toJSON(),
  }));
}
