
(() => {
  console.log("barchart.js loaded");

  const CSV_PATH = encodeURI("Data/FinalProject_CPS Cases - Year and Removal Description.csv");

  const width = 900, height = 700;
  const margin = { top: 20, right: 30, bottom: 50, left: 70 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svgRoot = d3.select("#chart");
  if (svgRoot.empty()) {
    console.error('No <svg id="chart"> found.');
    return;
  }
  svgRoot.selectAll("*").remove();

  const svg = svgRoot
    .attr("viewBox", [0, 0, width, height])
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const tooltip = d3.select("#line-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

  const x0 = d3.scaleBand().range([0, innerW]).paddingInner(0.2);
  const x1 = d3.scaleBand().padding(0.15);
  const y  = d3.scaleLinear().range([innerH, 0]);
  const color = d3.scaleOrdinal();

  const findCol = (cols, re) => cols.find(c => re.test(c.replace(/\s+/g, " ").trim().toLowerCase()));
  const parseYear = v => {
    if (v == null || v === "") return NaN;
    if (Number.isFinite(+v)) return +v;
    const m = String(v).match(/\b(19|20)\d{2}\b/);
    return m ? +m[0] : NaN;
  };
  const parseNum = v => {
    if (v == null || v === "") return NaN;
    const n = +String(v).replace(/,/g, "").trim();
    return Number.isFinite(n) ? n : NaN;
  };

  d3.csv(CSV_PATH).then(rows => {
    if (!rows?.length) return;

    const columns = Object.keys(rows[0]);

    const yearCol =
      findCol(columns, /^year$/i) ||
      findCol(columns, /\bfiscal.*year\b|\bacademic.*year\b|\bcalendar.*year\b|year/i) ||
      "Year";

    const typeCol =
      findCol(columns, /removal.*description|removal.*(type|category)|description|reason/i);

    const countCol =
      findCol(columns, /^count$/i) ||
      findCol(columns, /\b(confirmed\s*cps\s*victims?|victims?|cases?|value|total|num(ber)?)\b/i);

    let years = [];
    let keys  = [];
    let flat  = [];

    if (typeCol && countCol) {
      const data = rows.map(r => ({
        year: parseYear(r[yearCol]),
        key: String(r[typeCol] ?? "").trim(),
        value: parseNum(r[countCol])
      })).filter(d => Number.isFinite(d.year) && d.key && Number.isFinite(d.value));

      years = Array.from(new Set(data.map(d => d.year))).sort((a,b)=>a-b);
      const byKeyYear = d3.rollup(data, v => d3.sum(v, d => d.value), d => d.key, d => d.year);
      keys = Array.from(byKeyYear.keys());
      flat = keys.flatMap(k =>
        years.map(yv => ({ year: yv, key: k, value: byKeyYear.get(k)?.get(yv) || 0 }))
      );
    } else {
      years = rows.map(r => parseYear(r[yearCol])).filter(Number.isFinite).sort((a,b)=>a-b);
      keys = columns.filter(c =>
        c !== yearCol && rows.some(r => Number.isFinite(parseNum(r[c])))
      );
      flat = rows.flatMap(r => {
        const yv = parseYear(r[yearCol]);
        if (!Number.isFinite(yv)) return [];
        return keys.map(k => ({ year: yv, key: k.trim(), value: parseNum(r[k]) || 0 }));
      });
    }

    x0.domain(years);
    x1.domain(keys).range([0, x0.bandwidth()]);
    y.domain([0, d3.max(flat, d => d.value) || 1]).nice();

    const paletteByKey = {
      "investigation":       "#B39DDB",
      "family preservation": "#4E79A7"
    };
    color
      .domain(keys)
      .range(keys.map(k => paletteByKey[k.toLowerCase().trim()] || "#999999"));

    svg.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x0).tickFormat(d3.format("d")))
      .call(g => g.append("text")
        .attr("x", innerW / 2)
        .attr("y", 36)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Year"));

    svg.append("g")
      .call(d3.axisLeft(y).ticks(8))
      .call(g => g.append("text")
        .attr("x", -margin.left + 10)
        .attr("y", -10)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text("Number of cases"));

    const yearG = svg.selectAll(".year")
      .data(years)
      .join("g")
      .attr("class", "year")
      .attr("transform", d => `translate(${x0(d)},0)`);

    yearG.selectAll("rect")
      .data(y => keys.map(k => ({
        year: y,
        key: k,
        value: flat.find(d => d.year === y && d.key === k)?.value || 0
      })))
      .join("rect")
      .attr("x", d => x1(d.key))
      .attr("y", d => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", d => innerH - y(d.value))
      .attr("fill", d => color(d.key))
      .on("mouseover", (event, d) => {
        tooltip
          .html(`<strong>${d.key}</strong><br>Year: ${d.year}<br>Cases: ${d.value.toLocaleString()}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px")
          .style("opacity", 1);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    const legend = svg.append("g")
      .attr("transform", `translate(${innerW - 160}, 0)`);
    const leg = legend.selectAll("g")
      .data(keys)
      .join("g")
      .attr("transform", (d,i) => `translate(0, ${i*20})`);
    leg.append("rect")
      .attr("width", 12).attr("height", 12)
      .attr("fill", d => color(d));
    leg.append("text")
      .attr("x", 16).attr("y", 10)
      .style("font", "12px system-ui, sans-serif")
      .text(d => d);
  }).catch(err => console.error(err));
})();
