// 01-texas-map.js — small legend (numbers only), faint borders, subtle contrast
(() => {
  const width = 900, height = 700;

  // Subtle boost near white; tweak if you want (0.95 = very subtle, 0.85 = stronger)
  const GAMMA = 0.90;

  // Small legend config
  const LEGEND_WIDTH = 220;
  const LEGEND_HEIGHT = 10;
  const LEGEND_TOP = 14;
  const LEGEND_RIGHT = 14;
  const LEGEND_FONT = 10;

  const svg = d3.select("#map").attr("viewBox", `0 0 ${width} ${height}`);
  const tooltip = d3.select("#tooltip");

  const projection = d3.geoConicConformal()
    .parallels([27.5, 35])
    .rotate([98, 0])
    .center([-1.5, 31])
    .scale(3500)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const GEO_PATH = "texasmapp.json";
  const CSV_PATH = encodeURI("Data/FinalProject_CPS Cases - PivotTable_Differences.csv");

  const norm = s => String(s || "").toLowerCase().trim();
  const toNum = v => {
    const n = +String(v ?? "").replace(/,/g, "").trim();
    return Number.isFinite(n) ? n : NaN;
  };

  Promise.all([d3.json(GEO_PATH), d3.csv(CSV_PATH)]).then(([geoData, table]) => {
    const features = geoData.features || geoData;

    // County -> value
    const valueByCounty = new Map(table.map(r => [norm(r["County"]), toNum(r["Difference 15-24"])]));
    const vals = Array.from(valueByCounty.values()).filter(Number.isFinite);
    const extent = d3.extent(vals);
    const maxAbs = Math.max(Math.abs(extent[0] ?? -1), Math.abs(extent[1] ?? 1)) || 1;

    // "Nice" symmetric span for clean ticks
    const legendTicks = d3.ticks(-maxAbs, maxAbs, 5);
    const legendMax = Math.max(
      Math.abs(legendTicks[0]),
      Math.abs(legendTicks[legendTicks.length - 1])
    ) || maxAbs;

    // Color with small gamma boost near white
    const interp = d3.interpolatePuOr; // purple (more) -> white -> orange (fewer)
    const colorValue = v => {
      if (!Number.isFinite(v)) return "#f0f0f0";
      let s = Math.max(-1, Math.min(1, v / legendMax));   // normalize to [-1,1]
      s = Math.sign(s) * Math.pow(Math.abs(s), GAMMA);    // subtle boost
      return interp((s + 1) / 2);
    };

    // Map
    svg.append("g")
      .attr("class", "counties")
      .selectAll("path")
      .data(features)
      .join("path")
      .attr("d", path)
      .attr("fill", d => colorValue(valueByCounty.get(norm(d.properties?.CNTY_NM))))
      .attr("stroke", "#000")
      .attr("stroke-opacity", 0.12)   // faint border
      .attr("stroke-width", 0.35)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("shape-rendering", "crispEdges")
      .attr("paint-order", "stroke fill")
      .on("mouseover", (event, d) => {
        const name = d.properties?.CNTY_NM ?? "Unknown county";
        const v = valueByCounty.get(norm(name));
        tooltip.html(
          `<strong>${name}</strong><br>
           Difference from 2015–2024: ${Number.isFinite(v) ? v : "N/A"}`
        )
        .style("left", (event.pageX + 10) + "px")
        .style("top",  (event.pageY - 28) + "px")
        .style("opacity", 1);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    // Small legend (numbers only)
    drawSmallLegend(svg, colorValue, legendMax);
  }).catch(err => console.error("Error loading data:", err));

  function drawSmallLegend(svg, colorValue, legendMax) {
    const x = d3.scaleLinear()
      .domain([-legendMax, legendMax])
      .range([0, LEGEND_WIDTH]);

    // Gradient that matches the map colors
    const defs = svg.append("defs");
    const grad = defs.append("linearGradient")
      .attr("id", "legend-gradient")
      .attr("x1", "0").attr("x2", "1")
      .attr("y1", "0").attr("y2", "0");

    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const v = -legendMax + t * (2 * legendMax);
      grad.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", colorValue(v));
    }

    const g = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width - LEGEND_WIDTH - LEGEND_RIGHT}, ${LEGEND_TOP})`);

    // Color ramp
    g.append("rect")
      .attr("width", LEGEND_WIDTH)
      .attr("height", LEGEND_HEIGHT)
      .attr("fill", "url(#legend-gradient)")
      .attr("stroke", "#ccc")
      .attr("shape-rendering", "crispEdges");

    // Numbers only (3 ticks so it doesn’t crowd)
    const axis = d3.axisBottom(x)
      .tickValues([-legendMax, 0, legendMax])
      .tickFormat(d3.format(",d"))
      .tickSize(4)
      .tickPadding(2);

    g.append("g")
      .attr("transform", `translate(0, ${LEGEND_HEIGHT})`)
      .call(axis)
      .call(s => s.select(".domain").remove())
      .call(s => s.selectAll("text").attr("font-size", LEGEND_FONT));
  }
})();
