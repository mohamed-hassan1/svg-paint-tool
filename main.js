/**
 * SVG Paint Tool & Filter Effects
 * --------------------------------
 * Proof-of-Concept tool to upload SVG files, dynamically recolor them,
 * apply multiple visual filters (shine, metallic, shadow, color tuning),
 * and export the customized SVG.
 *
 * All processing is done client-side using inline SVG manipulation.
 */

(function () {
  // === UI REFERENCES ===
  const UI_section = document.querySelector(".svgpaint-container"),
    UI_uploader = UI_section.querySelector(".uploader"),
    UI_preview = UI_section.querySelector(".preview"),
    UI_normalColors = UI_section.querySelector(".main-colors .color-list"),
    UI_restrictedColors = UI_section.querySelector(
      ".restricted-colors .color-list"
    ),
    UI_filterShine = UI_section.querySelector("#filter-shine"),
    UI_filterShadow = UI_section.querySelector("#filter-shadow"),
    UI_filterMetallic = UI_section.querySelector("#filter-metallic"),
    UI_filterSaturation = UI_section.querySelector("#filter-saturation"),
    UI_filterBrightness = UI_section.querySelector("#filter-brightness"),
    UI_filterContrast = UI_section.querySelector("#filter-contrast"),
    UI_downloadBtn = UI_section.querySelector("#download-svg");

  // Holds all detected SVG colors
  (let = colorsList = []),
    // Colors that should be treated as restricted / non-body colors
    (restrictedColorsListArr = [
      "#CAE4ED",
      "#252525",
      "#343434",
      "#8F8F8F",
      "#c4c4c4",
      "#e9f2f4",
      "#000000",
    ]);

  const app = {
    /**
     * Reset UI and internal state when uploading a new SVG
     */
    reset: function () {
      UI_preview.innerHTML = "";
      UI_normalColors.innerHTML = "";
      UI_restrictedColors.innerHTML = "";
      colorsList = [];

      // Reset filter toggles
      UI_filterShine.checked = false;
      UI_filterShadow.checked = false;
      UI_filterMetallic.checked = false;

      // Reset color tuning sliders
      UI_filterSaturation.value = 1;
      UI_filterBrightness.value = 1;
      UI_filterContrast.value = 1;
    },

    /**
     * Clone the SVG, inline all computed styles,
     * clean it up, and trigger download
     */
    downloadSVGBtn: function (svg) {
      const clone = svg.cloneNode(true);

      // Ensure SVG namespace exists
      if (!clone.getAttribute("xmlns")) {
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }

      // Inline computed styles so exported SVG keeps appearance
      clone.querySelectorAll("*").forEach((el) => {
        const style = getComputedStyle(el);
        if (style.fill && style.fill !== "none")
          el.setAttribute("fill", style.fill);
        if (style.stroke && style.stroke !== "none")
          el.setAttribute("stroke", style.stroke);
        if (style.filter && style.filter !== "none")
          el.setAttribute("filter", style.filter);
      });

      // Serialize SVG and download
      const svgData = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "customized.svg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Apply the shared master filter to the SVG content group
     */
    applyMasterFilter: function (svg) {
      const group = app.getOrCreateFilterGroup(svg);
      group.style.filter = "url(#master-filter)";
    },

    /**
     * Metallic paint toggle
     */
    filterMetallic: function (svg) {
      UI_filterMetallic.addEventListener("change", function (e) {
        app.injectMasterFilter(svg);
        app.applyMasterFilter(svg);

        const isChecked = e.target.checked;

        // Toggle the Grit Alpha
        const metalAlpha = document.querySelector("#mf-metal");
        if (metalAlpha) metalAlpha.setAttribute("slope", isChecked ? "1" : "0");

        // Toggle the Visibility Gate
        // Checked: slope 1, intercept 0 (Normal view)
        // Unchecked: slope 0, intercept 1 (Force White / Hidden)
        const slopeVal = isChecked ? "1" : "0";
        const interceptVal = isChecked ? "0" : "1";

        ["#mf-met-gate-R", "#mf-met-gate-G", "#mf-met-gate-B"].forEach((id) => {
          const el = document.querySelector(id);
          if (el) {
            el.setAttribute("slope", slopeVal);
            el.setAttribute("intercept", interceptVal);
          }
        });
      });
    },

    /**
     * Live update for saturation, brightness and contrast
     */
    filterUpdateColorTuning: function (svg) {
      [UI_filterSaturation, UI_filterBrightness, UI_filterContrast].forEach(
        (item) => {
          item.addEventListener("input", function () {
            app.injectMasterFilter(svg);
            app.applyMasterFilter(svg);

            const sat = UI_filterSaturation.value,
              bright = UI_filterBrightness.value,
              contrast = UI_filterContrast.value;

            svg.querySelector("#mf-saturation").setAttribute("values", sat);

            svg
              .querySelectorAll(
                "#mf-contrast feFuncR, #mf-contrast feFuncG, #mf-contrast feFuncB"
              )
              .forEach((fn) => {
                fn.setAttribute("slope", contrast);
                fn.setAttribute("intercept", bright - 1);
              });
          });
        }
      );
    },

    /**
     * Drop shadow toggle
     */
    filterShadowFun: function (svg) {
      UI_filterShadow.addEventListener("change", function (e) {
        app.injectMasterFilter(svg);
        app.applyMasterFilter(svg);

        const shadow = svg.querySelector("#mf-shadow");
        shadow.setAttribute("flood-opacity", e.target.checked ? "0.25" : "0");
      });
    },

    /**
     * Gradient shine overlay toggle
     */
    filterShineFun: function (svg) {
      UI_filterShine.addEventListener("change", function (e) {
        app.injectMasterFilter(svg);
        app.applyMasterFilter(svg);

        document
          .querySelector("#mf-shine-flood")
          .setAttribute("flood-opacity", e.target.checked ? "0.35" : "0");
      });
    },

    /**
     * Wrap SVG content in a group so filters
     * can be applied without touching <defs>
     */
    getOrCreateFilterGroup: function (svg) {
      let group = svg.querySelector("#filter-group");

      if (!group) {
        group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.id = "filter-group";

        while (svg.firstChild && svg.firstChild.tagName !== "defs") {
          group.appendChild(svg.firstChild);
        }

        svg.appendChild(group);
      }

      return group;
    },

    /**
     * Inject the master SVG filter once.
     * All effects are controlled by updating its primitives.
     */
    injectMasterFilter: function (svg) {
      if (svg.querySelector("#master-filter")) return;

      const defs = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs"
      );

      defs.innerHTML = `
      <linearGradient id="metal-rect-grad" x1="0" y1="0" x2="0" y2="200%">
        <stop offset="0%" stop-color="white" /> 
        <stop offset="20%" stop-color="white" /> 
        <stop offset="45%" stop-color="gray" /> 
        <stop offset="100%" stop-color="gray" />
      </linearGradient>

      <rect id="metal-rect-shape" width="100%" height="100%" fill="url(#metal-rect-grad)" />

      <filter id="master-filter" color-interpolation-filters="sRGB">

        <feGaussianBlur in="SourceGraphic" stdDeviation="40" result="shineBlur"/>
        <feFlood id="mf-shine-flood" flood-color="white" flood-opacity="0" result="shineColor"/>
        <feComposite in="shineColor" in2="shineBlur" operator="in" result="shineGradient"/>
        <feOffset in="shineGradient" dx="-25" dy="-25" result="shineOffset"/>
        <feGaussianBlur in="shineOffset" stdDeviation="25" result="shineBlurred"/>
        <feComposite in="shineBlurred" in2="SourceGraphic" operator="in" result="shineMasked"/>
        <feBlend mode="screen" in="SourceGraphic" in2="shineMasked" result="afterShine"/>

        <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="5" seed="1" result="rawNoise"/>
        <feColorMatrix in="rawNoise" type="saturate" values="0" result="grayNoise"/>
        
        <feComponentTransfer in="grayNoise" result="darkGrit">
            <feFuncR type="linear" slope="15" intercept="-7"/>
            <feFuncG type="linear" slope="15" intercept="-7"/>
            <feFuncB type="linear" slope="15" intercept="-7"/>
            <feFuncA id="mf-metal" type="linear" slope="0" intercept="0"/>
        </feComponentTransfer>

        <feImage href="#metal-rect-shape" result="fadeMask" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"/>
        
        <feComposite in="darkGrit" in2="fadeMask" operator="arithmetic" k2="1" k3="1" result="fadedGrit"/>
        <feComposite in="fadedGrit" in2="SourceGraphic" operator="in" result="metalFinalTexture"/>

        <feComponentTransfer in="metalFinalTexture" result="gatedMetallic">
            <feFuncR id="mf-met-gate-R" type="linear" slope="0" intercept="1"/>
            <feFuncG id="mf-met-gate-G" type="linear" slope="0" intercept="1"/>
            <feFuncB id="mf-met-gate-B" type="linear" slope="0" intercept="1"/>
        </feComponentTransfer>

        <feBlend mode="multiply" in="gatedMetallic" in2="afterShine" result="afterMetal"/>

        <feDropShadow id="mf-shadow" in="afterMetal" dx="0" dy="4" stdDeviation="6" flood-opacity="0" result="afterShadow"/>

        <feColorMatrix id="mf-saturation" in="afterShadow" type="saturate" values="1" result="afterSaturation"/>

        <feComponentTransfer id="mf-contrast" in="afterSaturation">
          <feFuncR type="linear" slope="1" intercept="0"/>
          <feFuncG type="linear" slope="1" intercept="0"/>
          <feFuncB type="linear" slope="1" intercept="0"/>
        </feComponentTransfer>
      </filter>
      `;

      svg.appendChild(defs);
    },

    /**
     * Bind color inputs to SVG elements using a color → elements map
     */
    createColorInputs: function (colorMap) {
      let UI_newInputsColors = document.querySelectorAll(".inputcolor");

      UI_newInputsColors.forEach((input) => {
        input.addEventListener("input", (e) => {
          const newColor = e.target.value;
          const elements = colorMap.get(input.getAttribute("currcolor"));
          if (!elements) return;

          elements.forEach((el) => {
            el.style.fill = newColor;
          });

          input.setAttribute("currcolor", newColor);

          // Update map for next changes
          colorMap.set(newColor, elements);
          colorMap.delete(this);
        });
      });
    },

    /**
     * Build a map of color → SVG elements
     */
    buildColorElementMap: function (svgEl) {
      const map = new Map();

      svgEl.querySelectorAll("*").forEach((el) => {
        const fill = getComputedStyle(el).fill;
        const normalized = app.normalizeColor(fill);
        if (!normalized) return;

        if (!map.has(normalized)) {
          map.set(normalized, []);
        }
        map.get(normalized).push(el);
      });

      return map;
    },

    /**
     * Count color occurrences
     */
    countColors: function (colors) {
      const map = new Map();

      colors.forEach((color) => {
        const normalized = app.normalizeColor(color);
        if (!normalized) return;
        map.set(normalized, (map.get(normalized) || 0) + 1);
      });

      return map;
    },

    /**
     * Sort colors by frequency (most used first)
     */
    sortColorsByFrequency: function (colorMap) {
      return [...colorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([color]) => color);
    },

    /**
     * Separate normal and restricted colors
     */
    applyForcedColors: function (sortedColors, forcedColors) {
      const forcedSet = new Set(forcedColors.map((c) => c.toLowerCase()));
      const normal = [];
      const forced = [];

      sortedColors.forEach((color) => {
        forcedSet.has(color) ? forced.push(color) : normal.push(color);
      });

      return [normal, forced, [...normal, ...forced]];
    },

    /**
     * Build final color palette structure
     */
    buildColorPalette: function (colors, forcedColors = []) {
      const colorMap = app.countColors(colors);
      const sorted = app.sortColorsByFrequency(colorMap);
      return app.applyForcedColors(sorted, forcedColors);
    },

    /**
     * Normalize colors to HEX for consistent comparison
     */
    normalizeColor: function (color) {
      if (!color) return null;
      color = color.trim();

      if (color.startsWith("#")) {
        if (color.length === 4) {
          return (
            "#" +
            color[1] +
            color[1] +
            color[2] +
            color[2] +
            color[3] +
            color[3]
          );
        }
        return color.toLowerCase();
      }

      if (color.startsWith("rgb")) {
        const match = color.match(/\d+/g);
        if (!match) return null;

        const [r, g, b] = match.map(Number);
        return (
          "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
        );
      }

      return null;
    },

    /**
     * Create a single color input element
     */
    createColorsInput: function (status, i, colors) {
      let colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "me-2 mb-2 cursor-pointer inputcolor";
      colorInput.setAttribute("role", "button");

      if (status) {
        colorInput.value = colors[0][i];
        colorInput.setAttribute("currcolor", colors[0][i]);
        UI_normalColors.appendChild(colorInput);
      } else {
        colorInput.value = colors[1][i];
        colorInput.setAttribute("currcolor", colors[1][i]);
        UI_restrictedColors.appendChild(colorInput);
      }
    },

    /**
     * Generate color inputs and initialize filters
     */
    addInputs: function () {
      let colors = app.buildColorPalette(colorsList, restrictedColorsListArr);

      for (let i = 0; i < colors[0].length; i++) {
        app.createColorsInput(true, i, colors);
      }

      for (let i = 0; i < colors[1].length; i++) {
        app.createColorsInput(false, i, colors);
      }

      let svg = UI_preview.querySelector("svg"),
        colorMap = app.buildColorElementMap(svg);

      // initialize filters
      app.createColorInputs(colorMap);
      app.injectMasterFilter(svg);
      app.getOrCreateFilterGroup(svg);
      app.filterShineFun(svg);
      app.filterShadowFun(svg);
      app.filterMetallic(svg);
      app.filterUpdateColorTuning(svg);
    },

    /**
     * Extract all fill colors from the SVG
     */
    getColors: function () {
      let svgEle = UI_preview.querySelector("svg");

      svgEle.querySelectorAll("*").forEach((item) => {
        let fillVal = getComputedStyle(item).fill;
        if (fillVal && fillVal !== "none" && fillVal !== "rgba(0, 0, 0, 0)") {
          colorsList.push(fillVal);
        }
      });

      if (colorsList.length !== 0) {
        app.addInputs();
      }
    },

    /**
     * Handle SVG upload and initialization
     */
    uploaderFun: function () {
      UI_uploader.addEventListener("change", function () {
        if (this.files.length !== 1 && this.files[0].type !== "image/svg+xml") {
          console.log("Please upload a valid SVG file");
          return;
        }

        app.reset();

        const reader = new FileReader();
        reader.onload = (e) => {
          UI_preview.innerHTML = e.target.result;

          setTimeout(() => {
            // initialize SVG
            app.getColors();
          }, 10);
        };
        reader.readAsText(this.files[0]);
      });
    },

    /**
     * App entry point
     */
    init: function () {
      // Initialize Upload
      app.uploaderFun();

      // Check for SVG in the preview container
      if (UI_preview.querySelector("svg")) {
        // Initialize SVG
        app.getColors();
      }

      // Download Button
      UI_downloadBtn.addEventListener("click", () => {
        app.downloadSVGBtn(UI_preview.querySelector("svg"));
      });
    },
  };

  // Initialize after page load
  window.addEventListener("load", app.init);
})();
