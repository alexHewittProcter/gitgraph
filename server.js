require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
  console.error(
    "❌ Missing required environment variables. Please check your .env file."
  );
  console.error("Required: GITHUB_TOKEN, GITHUB_USERNAME");
  process.exit(1);
}

// Helper function to get date range for rolling periods
function getDateRange(period) {
  const now = new Date();
  const ranges = {
    "1week": new Date(now - 7 * 24 * 60 * 60 * 1000),
    "1month": new Date(now - 30 * 24 * 60 * 60 * 1000),
    "90day": new Date(now - 90 * 24 * 60 * 60 * 1000),
    "6month": new Date(now - 180 * 24 * 60 * 60 * 1000),
    "1year": new Date(now - 365 * 24 * 60 * 60 * 1000),
  };

  return {
    from: ranges[period] || ranges["1month"],
    to: now,
  };
}

// Format date for GitHub API
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// GitHub GraphQL query for contribution data
const CONTRIBUTIONS_QUERY = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }
    }
  }
`;

// API endpoint to get GitHub contributions
app.get("/api/contributions/:period", async (req, res) => {
  try {
    const { period } = req.params;
    const dateRange = getDateRange(period);

    const response = await axios.post(
      "https://api.github.com/graphql",
      {
        query: CONTRIBUTIONS_QUERY,
        variables: {
          username: GITHUB_USERNAME,
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.errors) {
      console.error("GitHub API errors:", response.data.errors);
      return res
        .status(400)
        .json({ error: "GitHub API error", details: response.data.errors });
    }

    const contributionData = response.data.data.user.contributionsCollection;

    // Process the data into a more usable format
    const dailyContributions = [];
    contributionData.contributionCalendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        dailyContributions.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });

    // Sort by date
    dailyContributions.sort((a, b) => new Date(a.date) - new Date(b.date));

    const responseData = {
      period,
      dateRange: {
        from: formatDate(dateRange.from),
        to: formatDate(dateRange.to),
      },
      summary: {
        totalCommits: contributionData.totalCommitContributions,
        totalIssues: contributionData.totalIssueContributions,
        totalPRs: contributionData.totalPullRequestContributions,
        totalReviews: contributionData.totalPullRequestReviewContributions,
        totalDays: dailyContributions.length,
        activeDays: dailyContributions.filter((day) => day.count > 0).length,
      },
      contributions: dailyContributions,
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching GitHub contributions:", error.message);
    if (error.response) {
      console.error(
        "GitHub API response:",
        error.response.status,
        error.response.data
      );
    }
    res.status(500).json({
      error: "Failed to fetch contributions",
      message: error.message,
    });
  }
});

// Helper function to get rolling period days
function getRollingPeriodDays(period) {
  const periods = {
    "1week": 7,
    "1month": 30,
    "90day": 90,
    "6month": 180,
    "1year": 365,
  };
  return periods[period] || 30;
}

// Helper function to calculate rolling sums
function calculateRollingSums(contributions, rollingDays) {
  const contributionMap = new Map();
  contributions.forEach((contrib) => {
    contributionMap.set(contrib.date, contrib.count);
  });

  const sortedDates = contributions.map((c) => c.date).sort();
  const rollingSums = [];

  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    let sum = 0;

    // Calculate sum for the rolling window ending on currentDate
    for (let j = 0; j < rollingDays; j++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() - j);
      const dateStr = formatDate(checkDate);
      sum += contributionMap.get(dateStr) || 0;
    }

    rollingSums.push({
      date: sortedDates[i],
      rollingSum: sum,
    });
  }

  return rollingSums;
}

// Helper function to fetch contributions in yearly chunks
async function fetchAllContributions(accountCreated, now) {
  const allContributions = [];
  const currentDate = new Date(now);

  while (currentDate > accountCreated) {
    const yearEnd = new Date(currentDate);
    const yearStart = new Date(currentDate);
    yearStart.setFullYear(yearStart.getFullYear() - 1);

    // Don't go before account creation
    if (yearStart < accountCreated) {
      yearStart.setTime(accountCreated.getTime());
    }

    console.log(
      `Fetching contributions from ${formatDate(yearStart)} to ${formatDate(
        yearEnd
      )}`
    );

    const response = await axios.post(
      "https://api.github.com/graphql",
      {
        query: CONTRIBUTIONS_QUERY,
        variables: {
          username: GITHUB_USERNAME,
          from: yearStart.toISOString(),
          to: yearEnd.toISOString(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.errors) {
      throw new Error(
        `GitHub API error: ${JSON.stringify(response.data.errors)}`
      );
    }

    const contributionData = response.data.data.user.contributionsCollection;

    // Process and add to all contributions
    contributionData.contributionCalendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        allContributions.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });

    // Move to the next year back
    currentDate.setFullYear(currentDate.getFullYear() - 1);
  }

  // Remove duplicates and sort
  const uniqueContributions = new Map();
  allContributions.forEach((contrib) => {
    uniqueContributions.set(contrib.date, contrib.count);
  });

  return Array.from(uniqueContributions.entries())
    .map(([date, count]) => ({
      date,
      count,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// API endpoint to get rolling average contributions
app.get("/api/rolling-contributions/:period", async (req, res) => {
  try {
    const { period } = req.params;
    const rollingDays = getRollingPeriodDays(period);

    // Get user's account creation date first
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const accountCreated = new Date(userResponse.data.created_at);
    const now = new Date();

    console.log(
      `Fetching rolling contributions for ${period} (${rollingDays} days)`
    );
    console.log(
      `Account created: ${formatDate(
        accountCreated
      )}, fetching until: ${formatDate(now)}`
    );

    // Fetch all contributions in yearly chunks
    const allContributions = await fetchAllContributions(accountCreated, now);

    console.log(`Fetched ${allContributions.length} days of contribution data`);

    // Calculate rolling sums
    const rollingSums = calculateRollingSums(allContributions, rollingDays);

    // Calculate some summary statistics
    const rollingValues = rollingSums.map((r) => r.rollingSum);
    const maxRolling = Math.max(...rollingValues);
    const minRolling = Math.min(...rollingValues);
    const avgRolling =
      rollingValues.reduce((a, b) => a + b, 0) / rollingValues.length;

    const responseData = {
      period,
      rollingDays,
      dateRange: {
        from: formatDate(accountCreated),
        to: formatDate(now),
      },
      summary: {
        maxRolling: Math.round(maxRolling),
        minRolling: Math.round(minRolling),
        avgRolling: Math.round(avgRolling),
        totalDays: rollingSums.length,
        accountAge: Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24)),
      },
      rollingSums: rollingSums,
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching rolling contributions:", error.message);
    if (error.response) {
      console.error(
        "GitHub API response:",
        error.response.status,
        error.response.data
      );
    }
    res.status(500).json({
      error: "Failed to fetch rolling contributions",
      message: error.message,
    });
  }
});

// API endpoint to get user info
app.get("/api/user", async (req, res) => {
  try {
    const response = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    res.json({
      username: response.data.login,
      name: response.data.name,
      avatar: response.data.avatar_url,
      profile: response.data.html_url,
      createdAt: response.data.created_at,
    });
  } catch (error) {
    console.error("Error fetching user info:", error.message);
    res.status(500).json({
      error: "Failed to fetch user info",
      message: error.message,
    });
  }
});

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 GitGraph server running on http://localhost:${PORT}`);
  console.log(`📊 Using GitHub user: ${GITHUB_USERNAME}`);
  console.log(`🔑 GitHub token configured: ${GITHUB_TOKEN ? "✅" : "❌"}`);
});
