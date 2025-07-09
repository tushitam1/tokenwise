(async () => {
  // helper to download a blob
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href      = url;
    a.download  = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // read dates and build query string
  function buildQuery() {
    const from = document.getElementById('fromDate').value;
    const to   = document.getElementById('toDate').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to',   to);
    return params.toString() ? `?${params}` : '';
  }

  // fetch summary & holders with optional date filters
  async function fetchReportData() {
    const qs = buildQuery();
    const [ sumRes, holdersRes ] = await Promise.all([
      fetch(`/api/summary${qs}`),
      fetch(`/api/holders${qs}`)
    ]);
    return {
      summary: await sumRes.json(),
      holders: await holdersRes.json()
    };
  }

  // CSV helper
  function jsonToCsv(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const header = cols.join(',');
    const lines = rows.map(r =>
      cols.map(c => `"${String(r[c]).replace(/"/g,'""')}"`).join(',')
    );
    return [ header, ...lines ].join('\r\n');
  }

  // render everything
  let charts = {};
  async function renderAll() {
    const { summary, holders } = await fetchReportData();

    // clear old canvases before drawing
    for (let id of ['buySellChart','protocolChart','holdersChart']) {
      if (charts[id]) charts[id].destroy();
    }

    // 1) Buys vs Sells
    const sumSec = document.getElementById('summarySection');
    sumSec.querySelector('.direction-label')?.remove();
    if ((summary.buys + summary.sells) === 0) {
      sumSec.insertAdjacentHTML('beforeend',
        '<p>No data for this range.</p>'
      );
    } else {
      charts.buySellChart = new Chart(
        document.getElementById('buySellChart'), {
          type: 'pie',
          data: {
            labels: ['Buys','Sells'],
            datasets: [{ data: [summary.buys, summary.sells] }]
          }
        }
      );
      // net direction
      const diff = (summary.buys||0) - (summary.sells||0);
      const lbl  = document.createElement('div');
      lbl.className = 'direction-label';
      lbl.textContent = diff > 0
        ? 'Net Direction: Buy-heavy'
        : diff < 0
          ? 'Net Direction: Sell-heavy'
          : 'Net Direction: Neutral';
      sumSec.appendChild(lbl);
    }

    // 2) Protocol breakdown
    const protoSec = document.getElementById('protocolSection');
    if (!summary.protocol.length) {
      protoSec.insertAdjacentHTML('beforeend','<p>No protocol data.</p>');
    } else {
      charts.protocolChart = new Chart(
        document.getElementById('protocolChart'), {
          type: 'bar',
          data: {
            labels: summary.protocol.map(p=>p.protocol),
            datasets: [{ data: summary.protocol.map(p=>p.count) }]
          },
          options: { scales:{ y:{ beginAtZero:true } } }
        }
      );
    }

    // 3) Top 10 holders
    const holdSec = document.getElementById('holdersSection');
    if (!holders.length) {
      holdSec.insertAdjacentHTML('beforeend','<p>No holders data.</p>');
    } else {
      const top10 = holders.slice(0,10);
      charts.holdersChart = new Chart(
        document.getElementById('holdersChart'), {
          type: 'bar',
          data: {
            labels: top10.map(h=>h.address),
            datasets:[{
              label:'Token Amount',
              data: top10.map(h=>h.amount)
            }]
          },
          options:{
            indexAxis:'y',
            scales:{ x:{ beginAtZero:true } }
          }
        }
      );
    }
  }

  // wire up buttons
  document.getElementById('applyFilter')
    .addEventListener('click', renderAll);

  document.getElementById('downloadJson')
    .addEventListener('click', async () => {
      const data = await fetchReportData();
      downloadBlob(
        new Blob([JSON.stringify(data, null, 2)],{type:'application/json'}),
        'tokenwise_report.json'
      );
    });

  document.getElementById('downloadCsv')
    .addEventListener('click', async () => {
      const { summary, holders } = await fetchReportData();
      const sumCsv = jsonToCsv([summary]);
      const holdCsv= jsonToCsv(holders);
      const content = ['# Summary', sumCsv, '', '# Holders', holdCsv].join('\r\n');
      downloadBlob(new Blob([content],{type:'text/csv'}),'tokenwise_report.csv');
    });

  // initial render
  renderAll();
})();
