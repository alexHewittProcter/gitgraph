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
