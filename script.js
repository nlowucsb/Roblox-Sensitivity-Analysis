const WORKBOOK_DEFAULTS = Object.freeze({
  sharesOutstanding: 661_640_000,
  netDebt: 596_250_000,
  baseWacc: 12.128446732539624,
  baseTerminalGrowth: 4,
  projectedFcfYear1: 1_710_000_000,
  baseGrowthRates: [22, 20, 20, 18],
});

const DELTAS = [-2, -1, 0, 1, 2];

const state = {
  baseWacc: WORKBOOK_DEFAULTS.baseWacc,
  baseTerminalGrowth: WORKBOOK_DEFAULTS.baseTerminalGrowth,
  fcfShift: 0,
  netDebt: WORKBOOK_DEFAULTS.netDebt,
  sharesOutstanding: WORKBOOK_DEFAULTS.sharesOutstanding,
  activeHeatmapId: "wacc-terminal",
  selectedKey: "wacc-terminal:0:0",
};

const refs = {
  waccInput: document.querySelector("#wacc-input"),
  waccSlider: document.querySelector("#wacc-slider"),
  terminalGrowthInput: document.querySelector("#terminal-growth-input"),
  terminalGrowthSlider: document.querySelector("#terminal-growth-slider"),
  fcfShiftInput: document.querySelector("#fcf-shift-input"),
  fcfShiftSlider: document.querySelector("#fcf-shift-slider"),
  netDebtInput: document.querySelector("#net-debt-input"),
  sharesInput: document.querySelector("#shares-input"),
  resetButton: document.querySelector("#reset-button"),
  basePrice: document.querySelector("#base-price"),
  summaryCards: document.querySelector("#summary-cards"),
  briefExplanation: document.querySelector("#brief-explanation"),
  heatmapTabs: document.querySelector("#heatmap-tabs"),
  heatmapGrid: document.querySelector("#heatmap-grid"),
  selectedValue: document.querySelector("#selected-value"),
  selectedContext: document.querySelector("#selected-context"),
  selectedDetails: document.querySelector("#selected-details"),
};

const heatmapConfigs = [
  {
    id: "wacc-terminal",
    title: "WACC vs Terminal Growth",
    description: "FCF growth stays at the selected base shift.",
    xLabel: "WACC Delta",
    yLabel: "Terminal Growth Delta",
    getScenario: (xDelta, yDelta) => ({
      wacc: state.baseWacc + xDelta,
      terminalGrowth: state.baseTerminalGrowth + yDelta,
      fcfShift: state.fcfShift,
    }),
  },
  {
    id: "wacc-fcf",
    title: "WACC vs FCF Growth",
    description: "Terminal growth stays at the current base value.",
    xLabel: "WACC Delta",
    yLabel: "FCF Growth Delta",
    getScenario: (xDelta, yDelta) => ({
      wacc: state.baseWacc + xDelta,
      terminalGrowth: state.baseTerminalGrowth,
      fcfShift: state.fcfShift + yDelta,
    }),
  },
  {
    id: "terminal-fcf",
    title: "Terminal Growth vs FCF Growth",
    description: "WACC stays at the current base value.",
    xLabel: "Terminal Growth Delta",
    yLabel: "FCF Growth Delta",
    getScenario: (xDelta, yDelta) => ({
      wacc: state.baseWacc,
      terminalGrowth: state.baseTerminalGrowth + xDelta,
      fcfShift: state.fcfShift + yDelta,
    }),
  },
];

function computeIntrinsicValue({ wacc, terminalGrowth, fcfShift }) {
  const waccRate = wacc / 100;
  const terminalRate = terminalGrowth / 100;
  const growthRates = WORKBOOK_DEFAULTS.baseGrowthRates.map(
    (rate) => (rate + fcfShift) / 100,
  );

  if (waccRate <= terminalRate) {
    return Number.NaN;
  }

  let projectedFcf = WORKBOOK_DEFAULTS.projectedFcfYear1;
  let presentValue = projectedFcf / (1 + waccRate);

  for (let year = 2; year <= 5; year += 1) {
    projectedFcf *= 1 + growthRates[year - 2];
    presentValue += projectedFcf / (1 + waccRate) ** year;
  }

  const terminalValue =
    (projectedFcf * (1 + terminalRate)) / (waccRate - terminalRate);
  const discountedTerminalValue = terminalValue / (1 + waccRate) ** 5;
  const equityValue = presentValue + discountedTerminalValue - state.netDebt;

  return equityValue / state.sharesOutstanding;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getColor(value, min, max) {
  if (!Number.isFinite(value)) {
    return "linear-gradient(135deg, rgba(32,22,14,0.12), rgba(32,22,14,0.22))";
  }

  const ratio = min === max ? 0.5 : (value - min) / (max - min);
  const hue = 14 + ratio * 152;
  const lightness = 86 - ratio * 24;
  return `linear-gradient(135deg, hsl(${hue} 65% ${lightness}%), hsl(${hue} 72% ${lightness - 7}%))`;
}

function buildScenarioDetails(label, scenario, intrinsicValue) {
  return [
    ["Scenario", label],
    ["Intrinsic value", formatCurrency(intrinsicValue)],
    ["WACC", `${scenario.wacc.toFixed(2)}%`],
    ["Terminal growth", `${scenario.terminalGrowth.toFixed(2)}%`],
    ["FCF growth shift", `${scenario.fcfShift >= 0 ? "+" : ""}${scenario.fcfShift.toFixed(2)}%`],
    ["Net debt", formatCurrency(state.netDebt)],
    [
      "Shares outstanding",
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        state.sharesOutstanding,
      ),
    ],
    [
      "Forecast growth path",
      WORKBOOK_DEFAULTS.baseGrowthRates
        .map((rate) => `${(rate + scenario.fcfShift).toFixed(1)}%`)
        .join(" / "),
    ],
  ];
}

function renderSummaryCards(baseValue) {
  const lowerScenario = computeIntrinsicValue({
    wacc: state.baseWacc + 2,
    terminalGrowth: state.baseTerminalGrowth - 2,
    fcfShift: state.fcfShift - 2,
  });

  const upsideScenario = computeIntrinsicValue({
    wacc: state.baseWacc - 2,
    terminalGrowth: state.baseTerminalGrowth + 2,
    fcfShift: state.fcfShift + 2,
  });

  const cards = [
    { label: "Base Intrinsic Value", value: formatCurrency(baseValue) },
    { label: "Downside Blend", value: formatCurrency(lowerScenario) },
    { label: "Upside Blend", value: formatCurrency(upsideScenario) },
    {
      label: "Current FCF Growth Shift",
      value: `${state.fcfShift >= 0 ? "+" : ""}${state.fcfShift.toFixed(1)}%`,
    },
  ];

  refs.summaryCards.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value">${card.value}</div>
        </article>
      `,
    )
    .join("");
}

function getHeatmapConfigById(id) {
  return heatmapConfigs.find((item) => item.id === id) ?? heatmapConfigs[0];
}

function getImpactMagnitude(baseScenario, partialScenario) {
  const baseValue = computeIntrinsicValue(baseScenario);
  const highValue = computeIntrinsicValue(partialScenario(2));
  const lowValue = computeIntrinsicValue(partialScenario(-2));
  const highMove = Number.isFinite(highValue) ? Math.abs(highValue - baseValue) : 0;
  const lowMove = Number.isFinite(lowValue) ? Math.abs(lowValue - baseValue) : 0;
  return Math.max(highMove, lowMove);
}

function renderBriefExplanation() {
  const baseScenario = {
    wacc: state.baseWacc,
    terminalGrowth: state.baseTerminalGrowth,
    fcfShift: state.fcfShift,
  };

  const impactByAssumption = [
    {
      label: "WACC",
      magnitude: getImpactMagnitude(baseScenario, (delta) => ({
        ...baseScenario,
        wacc: state.baseWacc + delta,
      })),
    },
    {
      label: "terminal growth",
      magnitude: getImpactMagnitude(baseScenario, (delta) => ({
        ...baseScenario,
        terminalGrowth: state.baseTerminalGrowth + delta,
      })),
    },
    {
      label: "FCF growth",
      magnitude: getImpactMagnitude(baseScenario, (delta) => ({
        ...baseScenario,
        fcfShift: state.fcfShift + delta,
      })),
    },
  ].sort((a, b) => b.magnitude - a.magnitude);

  const strongest = impactByAssumption[0];
  const middle = impactByAssumption[1];
  const weakest = impactByAssumption[2];

  const paragraph = `In this model, ${strongest.label} matters most for intrinsic value, with roughly a ${formatCurrency(strongest.magnitude)} per-share swing when moved by +/-2%, while ${middle.label} sits in the middle and ${weakest.label} is the least sensitive at current assumptions. This tells us valuation uncertainty is concentrated in discount-rate and growth inputs rather than a single point estimate, so the fair-value range is more informative than one exact number and should be interpreted as a scenario band, not a guaranteed price target.`;
  refs.briefExplanation.textContent = paragraph;
}

function renderHeatmapTabs() {
  refs.heatmapTabs.innerHTML = heatmapConfigs
    .map((config) => {
      const isActive = config.id === state.activeHeatmapId;
      return `
        <button
          class="heatmap-tab ${isActive ? "is-active" : ""}"
          type="button"
          data-heatmap-tab="${config.id}"
        >
          ${config.title}
        </button>
      `;
    })
    .join("");

  refs.heatmapTabs.querySelectorAll("[data-heatmap-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextHeatmapId = button.dataset.heatmapTab;
      if (state.activeHeatmapId === nextHeatmapId) {
        return;
      }

      state.activeHeatmapId = nextHeatmapId;
      state.selectedKey = `${nextHeatmapId}:0:0`;
      render();
    });
  });
}

function renderActiveHeatmap() {
  refs.heatmapGrid.innerHTML = "";
  const config = getHeatmapConfigById(state.activeHeatmapId);

  const scenarios = [];
  DELTAS.forEach((yDelta) => {
    DELTAS.forEach((xDelta) => {
      const scenario = config.getScenario(xDelta, yDelta);
      const value = computeIntrinsicValue(scenario);
      scenarios.push({ xDelta, yDelta, scenario, value });
    });
  });

  const finiteValues = scenarios
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value));
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  const tableHead = `
    <thead>
      <tr>
        <th>${config.yLabel}</th>
        ${DELTAS.map((delta) => `<th>${formatPercent(delta)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const tableBody = DELTAS.map((yDelta) => {
    const rowCells = DELTAS.map((xDelta) => {
      const cellKey = `${config.id}:${xDelta}:${yDelta}`;
      const cellData = scenarios.find(
        (entry) => entry.xDelta === xDelta && entry.yDelta === yDelta,
      );
      const isSelected = cellKey === state.selectedKey;

      return `
        <td>
          <button
            class="heatmap-cell ${isSelected ? "is-selected" : ""}"
            type="button"
            data-cell-key="${cellKey}"
            style="background:${getColor(cellData.value, min, max)};"
            aria-label="${config.title} ${formatPercent(xDelta)} and ${formatPercent(yDelta)} = ${formatCurrency(cellData.value)}"
          >
            ${formatCurrency(cellData.value)}
          </button>
        </td>
      `;
    }).join("");

    return `
      <tr>
        <th>${formatPercent(yDelta)}</th>
        ${rowCells}
      </tr>
    `;
  }).join("");

  const card = document.createElement("article");
  card.className = "heatmap-card";
  card.innerHTML = `
    <h3>${config.title}</h3>
    <p>${config.description}</p>
    <table class="heatmap-table">
      ${tableHead}
      <tbody>${tableBody}</tbody>
    </table>
  `;

  refs.heatmapGrid.appendChild(card);

  refs.heatmapGrid.querySelectorAll("[data-cell-key]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedKey = button.dataset.cellKey;
      render();
    });
  });
}

function renderSelectedScenario() {
  const [mapId, xDeltaString, yDeltaString] = state.selectedKey.split(":");
  const config = getHeatmapConfigById(mapId);
  const xDelta = Number(xDeltaString);
  const yDelta = Number(yDeltaString);
  const scenario = config.getScenario(xDelta, yDelta);
  const intrinsicValue = computeIntrinsicValue(scenario);
  const details = buildScenarioDetails(
    `${config.title} (${formatPercent(xDelta)}, ${formatPercent(yDelta)})`,
    scenario,
    intrinsicValue,
  );

  refs.selectedValue.textContent = formatCurrency(intrinsicValue);
  refs.selectedContext.textContent =
    "Values are per share and update live from the workbook-derived DCF model.";
  refs.selectedDetails.innerHTML = details
    .map(
      ([label, value]) => `
        <tr>
          <td>${label}</td>
          <td>${value}</td>
        </tr>
      `,
    )
    .join("");
}

function syncInputs() {
  refs.waccInput.value = state.baseWacc.toFixed(2);
  refs.waccSlider.value = state.baseWacc.toFixed(2);
  refs.terminalGrowthInput.value = state.baseTerminalGrowth.toFixed(2);
  refs.terminalGrowthSlider.value = state.baseTerminalGrowth.toFixed(2);
  refs.fcfShiftInput.value = state.fcfShift.toFixed(2);
  refs.fcfShiftSlider.value = state.fcfShift.toFixed(2);
  refs.netDebtInput.value = state.netDebt.toFixed(0);
  refs.sharesInput.value = state.sharesOutstanding.toFixed(0);
}

function render() {
  syncInputs();
  const baseValue = computeIntrinsicValue({
    wacc: state.baseWacc,
    terminalGrowth: state.baseTerminalGrowth,
    fcfShift: state.fcfShift,
  });

  refs.basePrice.textContent = formatCurrency(baseValue);
  renderSummaryCards(baseValue);
  renderBriefExplanation();
  renderHeatmapTabs();
  renderActiveHeatmap();
  renderSelectedScenario();
}

function handleInputChange() {
  state.baseWacc = clamp(Number(refs.waccInput.value) || 0, 1, 30);
  state.baseTerminalGrowth = clamp(
    Number(refs.terminalGrowthInput.value) || 0,
    -5,
    20,
  );
  state.fcfShift = clamp(Number(refs.fcfShiftInput.value) || 0, -10, 10);
  state.netDebt = clamp(Number(refs.netDebtInput.value) || 0, 0, 1_000_000_000_000);
  state.sharesOutstanding = clamp(
    Number(refs.sharesInput.value) || 1,
    1,
    100_000_000_000,
  );
  render();
}

function handleSliderChange() {
  state.baseWacc = clamp(Number(refs.waccSlider.value) || 0, 1, 30);
  state.baseTerminalGrowth = clamp(
    Number(refs.terminalGrowthSlider.value) || 0,
    -5,
    20,
  );
  state.fcfShift = clamp(Number(refs.fcfShiftSlider.value) || 0, -10, 10);
  render();
}

refs.waccInput.addEventListener("input", handleInputChange);
refs.terminalGrowthInput.addEventListener("input", handleInputChange);
refs.fcfShiftInput.addEventListener("input", handleInputChange);
refs.netDebtInput.addEventListener("input", handleInputChange);
refs.sharesInput.addEventListener("input", handleInputChange);
refs.waccSlider.addEventListener("input", handleSliderChange);
refs.terminalGrowthSlider.addEventListener("input", handleSliderChange);
refs.fcfShiftSlider.addEventListener("input", handleSliderChange);

refs.resetButton.addEventListener("click", () => {
  state.baseWacc = WORKBOOK_DEFAULTS.baseWacc;
  state.baseTerminalGrowth = WORKBOOK_DEFAULTS.baseTerminalGrowth;
  state.fcfShift = 0;
  state.netDebt = WORKBOOK_DEFAULTS.netDebt;
  state.sharesOutstanding = WORKBOOK_DEFAULTS.sharesOutstanding;
  state.activeHeatmapId = "wacc-terminal";
  state.selectedKey = "wacc-terminal:0:0";
  render();
});

render();
