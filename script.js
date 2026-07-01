// Set footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Smooth scroll for same-page anchor links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Tag filter (writeups page)
const tagFilterGroup = document.querySelector('.tag-filters');
if (tagFilterGroup) {
  const filterButtons = tagFilterGroup.querySelectorAll('.tag-filter');
  const entries = document.querySelectorAll('.entry-list .entry[data-tags]');
  const noMatch = document.querySelector('.tag-no-match');

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tag = btn.dataset.tag;
      let visibleCount = 0;

      entries.forEach(entry => {
        const tags = (entry.dataset.tags || '').trim().split(/\s+/);
        const show = tag === 'all' || tags.includes(tag);
        entry.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });

      if (noMatch) noMatch.style.display = visibleCount === 0 ? '' : 'none';
    });
  });
}
