(async () => {
  // Fetch both summary and holders in parallel
  const [sumRes, holdersRes] = await Promise.all([
    fetch('/api/summary'),
    fetch('/api/holders'),
  ]);
  const summary = await sumRes.json();
  const holders = await holdersRes.json();

  // ── Buys vs Sells ──
  const sumSection = document.getElementById('summarySection');
  if ((summary.buys + summary.sells) === 0) {
    sumSection.insertAdjacentHTML('beforeend',
      '<p>No transaction data yet. Waiting for live activity…</p>'
    );
  } else {
    new Chart(
      document.getElementById('buySellChart'),
      {
        type: 'pie',
        data: {
          labels: ['Buys', 'Sells'],
          datasets: [{ data: [summary.buys, summary.sells] }]
        }
      }
    );

    // ── compute & append net‐direction label ──
    const buys = summary.buys || 0;
    const sells = summary.sells || 0;
    const diff = buys - sells;
    const dirLabel = document.createElement('div');
    dirLabel.style.fontWeight = 'bold';
    dirLabel.textContent = diff > 0
      ? 'Net Direction: Buy-heavy'
      : diff < 0
        ? 'Net Direction: Sell-heavy'
        : 'Net Direction: Neutral';
    sumSection.appendChild(dirLabel);
  }

  // ── Protocol breakdown ──
  const protoSection = document.getElementById('protocolSection');
  if (!summary.protocol.length) {
    protoSection.insertAdjacentHTML('beforeend',
      '<p>No protocol usage data yet.</p>'
    );
  } else {
    new Chart(
      document.getElementById('protocolChart'),
      {
        type: 'bar',
        data: {
          labels: summary.protocol.map(p => p.protocol),
          datasets: [{ data: summary.protocol.map(p => p.count) }]
        }
      }
    );
  }

  // ── Top 10 holders ──
  const holdSection = document.getElementById('holdersSection');
  if (!holders.length) {
    holdSection.insertAdjacentHTML('beforeend',
      '<p>Could not load holders.</p>'
    );
  } else {
    const top10 = holders.slice(0, 10);
    new Chart(
      document.getElementById('holdersChart'),
      {
        type: 'bar',
        data: {
          labels: top10.map(h => h.address),
          datasets: [{
            label: 'Token Amount',
            data: top10.map(h => h.amount)
          }]
        },
        options: {
          indexAxis: 'y',           // horizontal bars
          scales: { x: { beginAtZero: true } }
        }
      }
    );
  }
})();
