// Vercel Node serverless function: POST /api/query-awards
// Body: { vendor, agency, fy, fy_start, fy_end, scope, limit }

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    const body = req.body || {};
    const {
      vendor,
      agency,
      fy,
      fy_start,
      fy_end,
      scope = "full",  // kept for compatibility; we don't branch on it
      limit = 50
    } = body;

    if (!vendor) {
      res.status(400).json({ error: "vendor is required" });
      return;
    }

    // Compute fiscal-year date windows (US FY: Oct 1 – Sep 30)
    // If fy is provided, use that for both start and end.
    const startFy = fy_start || fy || new Date().getFullYear();
    const endFy = fy_end || fy || startFy;

    const time_period = [];
    for (let year = startFy; year <= endFy; year++) {
      const start_date = `${year - 1}-10-01`;
      const end_date = `${year}-09-30`;
      time_period.push({ start_date, end_date });
    }

    // Map short agency codes to full names (simple helper; can expand later)
    const agencyMap = {
      USAID: "U.S. Agency for International Development",
      HHS: "DEPARTMENT OF HEALTH AND HUMAN SERVICES",
      VA: "DEPARTMENT OF VETERANS AFFAIRS",
      DHS: "DEPARTMENT OF HOMELAND SECURITY",
      STATE: "DEPARTMENT OF STATE",
      DOD: "DEPARTMENT OF DEFENSE",
      DoD: "DEPARTMENT OF DEFENSE"
    };

    const agencies = [];
    if (agency) {
      const key = agency.toUpperCase();
      const name = agencyMap[key] || agency;
      agencies.push({
        type: "awarding",
        tier: "toptier",
        name
      });
    }

    // Build filters: recipient, time period, agency, award types
    const filters = {
      // IMPORTANT: recipient_search_text must be an array
      // "vendor" will often be a UEI or exact legal name from your dictionary
      recipient_search_text: [vendor],
      time_period
    };

    if (agencies.length > 0) {
      filters.agencies = agencies;
    }

    // Always restrict to contract awards A, B, C, D as your default
    filters.award_type_codes = ["A", "B", "C", "D"];

    // No NAICS filter
    // No pricing filter

    const requestBody = {
      fields: [
        "Award ID",
        "Recipient Name",
        "Award Amount",
        "Action Date",
        "Description",
        "Award Type",
        "Period of Performance Start Date",
        "Period of Performance End Date",
        "NAICS",
        "PSC"
      ],
      filters,
      limit: limit || 50,
      page: 1,
      sort: "Award Amount",
      order: "desc"
    };

    const apiRes = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await apiRes.json().catch(() => ({}));

    res.status(apiRes.status).json({
      ok: apiRes.ok,
      status: apiRes.status,
      request: requestBody, // for debugging / GPT to inspect filters
      results: data.results || [],
      raw: data
    });
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({
      ok: false,
      error: "Proxy error",
      detail: String(err)
    });
  }
};
