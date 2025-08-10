
(() => {
  console.log("linechart.js loaded");

  const CSV_PATH = encodeURI("data/FinalProject_CPS Cases - Year and Removal Description.csv");
  const width = 900, height = 700;
  const margin = { top: 30, right: 160, bottom: 50, left: 60 };
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

  const tooltip = d3.select("#line-tooltip");
  if (tooltip.empty()) {
    console.warn('No <div id="line-tooltip"> found — tooltips will be disabled.');
  } else {
    tooltip
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("opacity", 0);
  }

  const x = d3.scaleLinear().range([0, innerW]);
  const y = d3.scaleLinear().range([innerH, 0]);
  const color = d3.scaleOrdinal(d3.schemeTableau10);

  const line = d3.line()
    .defined(d => Number.isFinite(d.value))
    .x(d => x(d.year))
    .y(d => y(d.value));

  function findCol(columns, regex) {
    return columns.find(c => regex.test(c.replace(/\s+/g, " ").trim().toLowerCase()));
  }
  function parseYear(v) {
    if (v == null || v === "") return NaN;
    if (Number.isFinite(+v)) return +v;
    const m = String(v).match(/\b(19|20)\d{2}\b/);
    return m ? +m[0] : NaN;
  }
  function parseNumber(v) {
    if (v == null || v === "") return NaN;
    const s = String(v).replace(/,/g, "").trim();
    const n = +s;
    return Number.isFinite(n) ? n : NaN;
  }

  d3.csv(CSV_PATH).then(rows => {
    if (!rows?.length) {
      console.warn("CSV loaded but empty:", CSV_PATH);
      return;
    }

    const columns = Object.keys(rows[0]);
    const yearCol =
      findCol(columns, /^year$/i) ||
      findCol(columns, /\bfiscal.*year\b|\bacademic.*year\b|\bcalendar.*year\b|year/i) ||
      "Year";

    const typeCol =
      findCol(columns, /removal.*description|removal.*(type|category)|description|reason/i);

    const countCol =
      findCol(columns, /^count$/i) ||
      findCol(columns, /\b(value|total|num(ber)?)\b/i);

    let series = [];
    let years = [];

    if (typeCol && countCol) {
      const data = rows.map(r => ({
        year: parseYear(r[yearCol]),
        key: String(r[typeCol] ?? "").trim(),
        value: parseNumber(r[countCol])
      })).filter(d =>
        Number.isFinite(d.year) && d.key && Number.isFinite(d.value)
      );

      if (!data.length) {
        console.warn("No usable rows after parsing (long format).");
        return;
      }

      years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);

      const rolled = d3.rollups(
        data,
        v => d3.sum(v, d => d.value),
        d => d.key,
        d => d.year
      );

      series = rolled.map(([key, yearMap]) => ({
        key,
        values: years.map(yv => ({ year: yv, value: yearMap.get(yv) || 0 }))
      }));
    } else {
      if (!columns.includes(yearCol)) {
        console.error("Couldn't find a Year column. Columns:", columns);
        return;
      }

      const valueCols = columns.filter(c =>
        c !== yearCol &&
        rows.some(r => Number.isFinite(parseNumber(r[c])))
      );

      if (!valueCols.length) {
        console.warn("Found Year but no numeric series columns.");
        return;
      }

      years = rows
        .map(r => parseYear(r[yearCol]))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      series = valueCols.map(col => ({
        key: col.trim(),
        values: rows
          .map(r => ({ year: parseYear(r[yearCol]), value: parseNumber(r[col]) }))
          .filter(d => Number.isFinite(d.year))
          .sort((a, b) => a.year - b.year)
      }));
    }

    if (!series.length) {
      console.warn("No series to draw.");
      return;
    }

    const allYears = series.flatMap(s => s.values.map(v => v.year));
    const allValues = series.flatMap(s => s.values.map(v => v.value));
    x.domain(d3.extent(allYears));
    y.domain([Math.min(0, d3.min(allValues) ?? 0), d3.max(allValues) || 1]).nice();
    color.domain(series.map(s => s.key));

    const xAxis = d3.axisBottom(x)
      .ticks(Math.min(12, new Set(allYears).size))
      .tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(y).ticks(8);

    svg.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .attr("class", "x-axis")
      .call(xAxis)
      .call(g => g.append("text")
        .attr("x", innerW / 2)
        .attr("y", 36)
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .text("Year")
      );

    svg.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .call(g => g.append("text")
        .attr("x", -margin.left + 10)
        .attr("y", -10)
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .text("Number of cases")
      );

    svg.append("g")
      .attr("fill", "none")
      .attr("stroke-width", 2)
      .selectAll("path.series")
      .data(series)
      .join("path")
      .attr("class", "series")
      .attr("stroke", d => color(d.key))
      .attr("d", d => line(d.values));

    const lastYear = d3.max(allYears);
    const labelGroup = svg.append("g");

    function labelOffsetForSeries(s) {

      const BY_KEY = {
        "Investigation": -12,       
        "Family Preservation": 12   
      };
      if (Object.prototype.hasOwnProperty.call(BY_KEY, s.key)) return BY_KEY[s.key];

      const hex = d3.color(color(s.key))?.formatHex().toLowerCase();
      if (hex === "#f28e2b") return -12; 
      if (hex === "#4e79a7") return 12;  
      return 0;
    }

    labelGroup
      .selectAll("text.end-label")
      .data(series)
      .join("text")
      .attr("class", "end-label")
      .attr("x", x(lastYear) + 6)
      .attr("y", d => {
        const last = d.values[d.values.length - 1];
        return y(last?.value ?? 0) + labelOffsetForSeries(d);
      })
      .attr("alignment-baseline", "middle")
      .attr("text-anchor", "start")

      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .style("paint-order", "stroke")
      .style("font", "12px system-ui, sans-serif")
      .text(d => d.key);


    const flat = series.flatMap(s => s.values.map(v => ({ key: s.key, ...v })));
    svg.append("g")
      .selectAll("circle.hit")
      .data(flat)
      .join("circle")
      .attr("class", "hit")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.value))
      .attr("r", 8)
      .attr("fill", "transparent")
      .on("mouseover", (event, d) => {
        if (tooltip.empty()) return;
        tooltip
          .html(`<strong>${d.key}</strong><br>Year: ${d.year}<br>Cases: ${d.value}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px")
          .style("opacity", 1);
      })
      .on("mouseout", () => {
        if (tooltip.empty()) return;
        tooltip.style("opacity", 0);
      });

    console.log(`Rendered ${series.length} series from ${CSV_PATH}`);
  }).catch(err => {
    console.error("Error loading or parsing CSV:", err);
  });
})();
