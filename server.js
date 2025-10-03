// Load environment variables with override for system variables
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Load .env file and override system environment variables
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  const envConfig = dotenv.parse(fs.readFileSync(envFile));
  for (const key in envConfig) {
    process.env[key] = envConfig[key];
  }
  console.log(
    "🔧 Loaded environment variables from .env file (overriding system vars)"
  );
} else {
  dotenv.config();
}

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 4000;

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

// Helper function to get both current and previous period date ranges
function getComparisonDateRanges(period) {
  const now = new Date();
  const periodDays = {
    "1week": 7,
    "1month": 30,
    "90day": 90,
    "6month": 180,
    "1year": 365,
  };

  const days = periodDays[period] || 30;

  // Current period
  const currentTo = now;
  const currentFrom = new Date(now - days * 24 * 60 * 60 * 1000);

  // Previous period (same duration, but shifted back)
  const previousTo = new Date(currentFrom);
  const previousFrom = new Date(currentFrom - days * 24 * 60 * 60 * 1000);

  return {
    current: { from: currentFrom, to: currentTo },
    previous: { from: previousFrom, to: previousTo },
  };
}

// Format date for GitHub API
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Helper function to calculate all streaks in a period
function calculateStreaks(contributions) {
  if (!contributions.length)
    return {
      streaks: [],
      streakFrequency: {},
      longestStreak: 0,
      totalStreaks: 0,
    };

  // Sort contributions by date
  const sortedContributions = [...contributions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const streaks = [];
  let currentStreak = 0;
  let streakStart = null;

  for (let i = 0; i < sortedContributions.length; i++) {
    const contribution = sortedContributions[i];
    const hasActivity = contribution.count > 0;

    if (hasActivity) {
      if (currentStreak === 0) {
        streakStart = contribution.date;
      }
      currentStreak++;
    } else {
      if (currentStreak > 0) {
        // End of a streak
        streaks.push({
          length: currentStreak,
          startDate: streakStart,
          endDate: sortedContributions[i - 1].date,
        });
        currentStreak = 0;
        streakStart = null;
      }
    }
  }

  // Handle case where period ends with an active streak
  if (currentStreak > 0) {
    streaks.push({
      length: currentStreak,
      startDate: streakStart,
      endDate: sortedContributions[sortedContributions.length - 1].date,
    });
  }

  // Calculate streak frequency (how many streaks of each length)
  const streakFrequency = {};
  let longestStreak = 0;

  // Initialize frequencies for lengths 1-30
  for (let i = 1; i <= 30; i++) {
    streakFrequency[i] = 0;
  }
  streakFrequency["31+"] = 0;

  streaks.forEach((streak) => {
    const length = streak.length;
    longestStreak = Math.max(longestStreak, length);

    if (length <= 30) {
      streakFrequency[length]++;
    } else {
      streakFrequency["31+"]++;
    }
  });

  return {
    streaks,
    streakFrequency,
    longestStreak,
    totalStreaks: streaks.length,
    averageStreakLength:
      streaks.length > 0
        ? streaks.reduce((sum, s) => sum + s.length, 0) / streaks.length
        : 0,
  };
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

// API endpoint to get comparison data (current vs previous period) - MUST BE BEFORE general route
app.get("/api/contributions/compare/:period", async (req, res) => {
  console.log(
    `📊 Comparison request received for period: ${req.params.period}`
  );
  try {
    const { period } = req.params;
    const dateRanges = getComparisonDateRanges(period);

    // Fetch current period data
    const currentResponse = await axios.post(
      "https://api.github.com/graphql",
      {
        query: CONTRIBUTIONS_QUERY,
        variables: {
          username: GITHUB_USERNAME,
          from: dateRanges.current.from.toISOString(),
          to: dateRanges.current.to.toISOString(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Fetch previous period data
    const previousResponse = await axios.post(
      "https://api.github.com/graphql",
      {
        query: CONTRIBUTIONS_QUERY,
        variables: {
          username: GITHUB_USERNAME,
          from: dateRanges.previous.from.toISOString(),
          to: dateRanges.previous.to.toISOString(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (currentResponse.data.errors || previousResponse.data.errors) {
      const errors = [
        ...(currentResponse.data.errors || []),
        ...(previousResponse.data.errors || []),
      ];
      console.error("GitHub API errors:", errors);
      return res
        .status(400)
        .json({ error: "GitHub API error", details: errors });
    }

    // Process current period data
    const currentData = currentResponse.data.data.user.contributionsCollection;
    const currentContributions = [];
    currentData.contributionCalendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        currentContributions.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });
    currentContributions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Process previous period data
    const previousData =
      previousResponse.data.data.user.contributionsCollection;
    const previousContributions = [];
    previousData.contributionCalendar.weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        previousContributions.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });
    previousContributions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate summaries and analytics for both periods
    const currentSummary = {
      totalCommits: currentData.totalCommitContributions,
      totalIssues: currentData.totalIssueContributions,
      totalPRs: currentData.totalPullRequestContributions,
      totalReviews: currentData.totalPullRequestReviewContributions,
      totalDays: currentContributions.length,
      activeDays: currentContributions.filter((day) => day.count > 0).length,
      totalContributions: currentContributions.reduce(
        (sum, day) => sum + day.count,
        0
      ),
    };

    const previousSummary = {
      totalCommits: previousData.totalCommitContributions,
      totalIssues: previousData.totalIssueContributions,
      totalPRs: previousData.totalPullRequestContributions,
      totalReviews: previousData.totalPullRequestReviewContributions,
      totalDays: previousContributions.length,
      activeDays: previousContributions.filter((day) => day.count > 0).length,
      totalContributions: previousContributions.reduce(
        (sum, day) => sum + day.count,
        0
      ),
    };

    // Calculate streak analysis for both periods
    const currentStreakAnalysis = calculateStreaks(currentContributions);
    const previousStreakAnalysis = calculateStreaks(previousContributions);

    // Calculate percentage changes
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const changes = {
      totalCommits: calculateChange(
        currentSummary.totalCommits,
        previousSummary.totalCommits
      ),
      totalIssues: calculateChange(
        currentSummary.totalIssues,
        previousSummary.totalIssues
      ),
      totalPRs: calculateChange(
        currentSummary.totalPRs,
        previousSummary.totalPRs
      ),
      totalReviews: calculateChange(
        currentSummary.totalReviews,
        previousSummary.totalReviews
      ),
      activeDays: calculateChange(
        currentSummary.activeDays,
        previousSummary.activeDays
      ),
      totalContributions: calculateChange(
        currentSummary.totalContributions,
        previousSummary.totalContributions
      ),
      longestStreak: calculateChange(
        currentStreakAnalysis.longestStreak,
        previousStreakAnalysis.longestStreak
      ),
      totalStreaks: calculateChange(
        currentStreakAnalysis.totalStreaks,
        previousStreakAnalysis.totalStreaks
      ),
      averageStreakLength: calculateChange(
        currentStreakAnalysis.averageStreakLength,
        previousStreakAnalysis.averageStreakLength
      ),
    };

    const responseData = {
      period,
      dateRanges: {
        current: {
          from: formatDate(dateRanges.current.from),
          to: formatDate(dateRanges.current.to),
        },
        previous: {
          from: formatDate(dateRanges.previous.from),
          to: formatDate(dateRanges.previous.to),
        },
      },
      current: {
        summary: currentSummary,
        contributions: currentContributions,
        analytics: calculateAnalytics(currentContributions),
        streakAnalysis: currentStreakAnalysis,
      },
      previous: {
        summary: previousSummary,
        contributions: previousContributions,
        analytics: calculateAnalytics(previousContributions),
        streakAnalysis: previousStreakAnalysis,
      },
      changes: changes,
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching comparison data:", error.message);
    if (error.response) {
      console.error(
        "GitHub API response:",
        error.response.status,
        error.response.data
      );
    }
    res.status(500).json({
      error: "Failed to fetch comparison data",
      message: error.message,
    });
  }
});

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

    // Calculate additional analytics
    const analytics = calculateAnalytics(dailyContributions);

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
      analytics: analytics,
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

// Helper function to calculate additional analytics
function calculateAnalytics(contributions) {
  // Weekly activity pattern (day of week analysis)
  const weeklyPattern = Array(7).fill(0); // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Activity intensity distribution
  const intensityBuckets = {
    0: 0, // No activity
    "1-3": 0, // Light activity
    "4-10": 0, // Moderate activity
    "11-20": 0, // High activity
    "21+": 0, // Very high activity
  };

  // Yearly summary
  const yearlyData = {};

  contributions.forEach((day) => {
    const date = new Date(day.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const year = date.getFullYear();

    // Weekly pattern
    weeklyPattern[dayOfWeek] += day.count;

    // Activity intensity
    if (day.count === 0) {
      intensityBuckets["0"]++;
    } else if (day.count <= 3) {
      intensityBuckets["1-3"]++;
    } else if (day.count <= 10) {
      intensityBuckets["4-10"]++;
    } else if (day.count <= 20) {
      intensityBuckets["11-20"]++;
    } else {
      intensityBuckets["21+"]++;
    }

    // Yearly summary
    if (!yearlyData[year]) {
      yearlyData[year] = 0;
    }
    yearlyData[year] += day.count;
  });

  // Format weekly pattern with day names
  const weeklyPatternFormatted = weeklyPattern.map((count, index) => ({
    day: dayNames[index],
    dayShort: dayNames[index].substring(0, 3),
    count: count,
  }));

  return {
    weeklyPattern: weeklyPatternFormatted,
    intensityDistribution: intensityBuckets,
    yearlyData: yearlyData,
  };
}

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
app.get(
  "/api/rolling-contributions/:timeRange/:rollingPeriod",
  async (req, res) => {
    try {
      const { timeRange, rollingPeriod } = req.params;
      const rollingDays = getRollingPeriodDays(rollingPeriod);

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
        `Fetching rolling contributions for time range: ${timeRange}, rolling period: ${rollingPeriod} (${rollingDays} days)`
      );
      console.log(
        `Account created: ${formatDate(
          accountCreated
        )}, fetching until: ${formatDate(now)}`
      );

      // Fetch all contributions in yearly chunks
      const allContributions = await fetchAllContributions(accountCreated, now);

      console.log(
        `Fetched ${allContributions.length} days of contribution data`
      );

      // Calculate rolling sums
      const rollingSums = calculateRollingSums(allContributions, rollingDays);

      // Calculate some summary statistics
      const rollingValues = rollingSums.map((r) => r.rollingSum);
      const maxRolling = Math.max(...rollingValues);
      const minRolling = Math.min(...rollingValues);
      const avgRolling =
        rollingValues.reduce((a, b) => a + b, 0) / rollingValues.length;

      const responseData = {
        timeRange,
        rollingPeriod,
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
          accountAge: Math.floor(
            (now - accountCreated) / (1000 * 60 * 60 * 24)
          ),
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
  }
);

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
