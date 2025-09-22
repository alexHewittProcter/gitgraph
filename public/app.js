class GitGraph {
  constructor() {
    this.chart = null;
    this.rollingChart = null;
    this.currentPeriod = "1month";
    this.contributionData = [];
    this.rollingData = [];
    this.tooltip = null;

    this.init();
  }

  init() {
    this.createTooltip();
    this.setupEventListeners();
    this.loadUserInfo();
    this.loadContributions(this.currentPeriod);
  }

  createTooltip() {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    document.body.appendChild(this.tooltip);
  }

  setupEventListeners() {
    const periodSelect = document.getElementById("periodSelect");
    const refreshBtn = document.getElementById("refreshBtn");

    periodSelect.addEventListener("change", (e) => {
      this.currentPeriod = e.target.value;
      this.loadContributions(this.currentPeriod);
    });

    refreshBtn.addEventListener("click", () => {
      this.loadContributions(this.currentPeriod);
    });
  }

  showLoading() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("errorMessage").style.display = "none";
  }

  showError(message) {
    document.getElementById("loading").style.display = "none";
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("errorMessage").style.display = "block";
    document.getElementById("errorText").textContent = message;
  }

  showContent() {
    document.getElementById("loading").style.display = "none";
    document.getElementById("mainContent").style.display = "block";
    document.getElementById("errorMessage").style.display = "none";
  }

  async loadUserInfo() {
    try {
      const response = await fetch("/api/user");
      if (!response.ok) throw new Error("Failed to load user info");

      const userData = await response.json();

      document.getElementById("userAvatar").src = userData.avatar;
      document.getElementById("userName").textContent =
        userData.name || userData.username;
      document.getElementById(
        "userUsername"
      ).textContent = `@${userData.username}`;
      document.getElementById("userInfo").style.display = "flex";
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  }

  async loadContributions(period) {
    this.showLoading();

    try {
      const response = await fetch(`/api/contributions/${period}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to load contributions");
      }

      const data = await response.json();
      this.contributionData = data.contributions;

      this.updateStatistics(data.summary, data.contributions);
      this.updateChart(data.contributions, period);
      this.updateHeatmap(data.contributions);
      this.updatePeriodDisplay(data.dateRange, period);

      // Load rolling contributions
      this.loadRollingContributions(period);

      this.showContent();
    } catch (error) {
      console.error("Error loading contributions:", error);
      this.showError(error.message);
    }
  }

  updateStatistics(summary, contributions) {
    document.getElementById("totalCommits").textContent =
      summary.totalCommits.toLocaleString();
    document.getElementById("activeDays").textContent =
      summary.activeDays.toLocaleString();
    document.getElementById("totalPRs").textContent =
      summary.totalPRs.toLocaleString();

    // Calculate current streak
    const streak = this.calculateCurrentStreak(contributions);
    document.getElementById("streakDays").textContent = streak.toLocaleString();
  }

  calculateCurrentStreak(contributions) {
    if (!contributions.length) return 0;

    // Sort contributions by date (most recent first)
    const sortedContributions = [...contributions].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const contribution of sortedContributions) {
      const contributionDate = new Date(contribution.date);
      contributionDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor(
        (today - contributionDate) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === streak && contribution.count > 0) {
        streak++;
      } else if (daysDiff === streak && streak === 0) {
        // Allow for today having 0 contributions to continue streak
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  updateChart(contributions, period) {
    const ctx = document.getElementById("contributionChart").getContext("2d");

    if (this.chart) {
      this.chart.destroy();
    }

    const labels = contributions.map((item) => {
      const date = new Date(item.date);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    });

    const data = contributions.map((item) => item.count);
    const maxContributions = Math.max(...data);

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Contributions",
            data: data,
            borderColor: "rgba(78, 205, 196, 1)",
            backgroundColor: "rgba(78, 205, 196, 0.1)",
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "rgba(78, 205, 196, 1)",
            pointBorderColor: "rgba(255, 255, 255, 1)",
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "rgba(78, 205, 196, 1)",
            pointHoverBorderColor: "rgba(255, 255, 255, 1)",
            pointHoverBorderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "white",
            bodyColor: "white",
            borderColor: "rgba(78, 205, 196, 1)",
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 14,
              weight: "bold",
            },
            bodyFont: {
              size: 13,
            },
            callbacks: {
              title: function (context) {
                const date = contributions[context[0].dataIndex].date;
                return new Date(date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
              },
              label: function (context) {
                const count = context.parsed.y;
                return `${count} contribution${count !== 1 ? "s" : ""}`;
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
              drawBorder: false,
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.7)",
              maxTicksLimit: 10,
            },
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
              drawBorder: false,
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.7)",
              stepSize: Math.max(1, Math.ceil(maxContributions / 5)),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  updateHeatmap(contributions) {
    const heatmapGrid = document.getElementById("heatmapGrid");
    heatmapGrid.innerHTML = "";

    contributions.forEach((contribution) => {
      const day = document.createElement("div");
      day.className = `heatmap-day ${this.getContributionLevel(
        contribution.count
      )}`;
      day.title = `${new Date(contribution.date).toLocaleDateString()} - ${
        contribution.count
      } contributions`;

      day.addEventListener("mouseenter", (e) => {
        this.showTooltip(e, contribution);
      });

      day.addEventListener("mouseleave", () => {
        this.hideTooltip();
      });

      heatmapGrid.appendChild(day);
    });
  }

  getContributionLevel(count) {
    if (count === 0) return "level-0";
    if (count <= 3) return "level-1";
    if (count <= 6) return "level-2";
    if (count <= 9) return "level-3";
    return "level-4";
  }

  showTooltip(event, contribution) {
    const date = new Date(contribution.date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    this.tooltip.innerHTML = `
            <strong>${date}</strong><br>
            ${contribution.count} contribution${
      contribution.count !== 1 ? "s" : ""
    }
        `;

    this.tooltip.style.left = event.pageX + 10 + "px";
    this.tooltip.style.top = event.pageY - 10 + "px";
    this.tooltip.classList.add("show");
  }

  hideTooltip() {
    this.tooltip.classList.remove("show");
  }

  updatePeriodDisplay(dateRange, period) {
    const periodNames = {
      "1week": "Past Week",
      "1month": "Past Month",
      "90day": "Past 90 Days",
      "6month": "Past 6 Months",
      "1year": "Past Year",
    };

    const fromDate = new Date(dateRange.from).toLocaleDateString();
    const toDate = new Date(dateRange.to).toLocaleDateString();

    document.getElementById(
      "chartPeriod"
    ).textContent = `${periodNames[period]} (${fromDate} - ${toDate})`;
  }

  async loadRollingContributions(period) {
    try {
      console.log(`Loading rolling contributions for ${period}`);
      const response = await fetch(`/api/rolling-contributions/${period}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to load rolling contributions"
        );
      }

      const data = await response.json();
      this.rollingData = data.rollingSums;

      this.updateRollingChart(data.rollingSums, period);
      this.updateRollingStats(data.summary, period);
      this.updateRollingPeriodDisplay(data.dateRange, period);

      console.log(`Loaded ${data.rollingSums.length} rolling data points`);
    } catch (error) {
      console.error("Error loading rolling contributions:", error);
      // Don't show error for rolling chart, just log it
    }
  }

  updateRollingChart(rollingSums, period) {
    const ctx = document
      .getElementById("rollingContributionChart")
      .getContext("2d");

    if (this.rollingChart) {
      this.rollingChart.destroy();
    }

    // Sample data points for performance (show every 7th day for better performance)
    const sampledData = rollingSums.filter((_, index) => index % 7 === 0);

    const labels = sampledData.map((item) => {
      const date = new Date(item.date);
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    });

    const data = sampledData.map((item) => item.rollingSum);
    const maxRolling = Math.max(...data);

    this.rollingChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: `Rolling ${this.getPeriodName(period)} Contributions`,
            data: data,
            borderColor: "rgba(255, 193, 7, 1)",
            backgroundColor: "rgba(255, 193, 7, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "rgba(255, 193, 7, 1)",
            pointBorderColor: "rgba(255, 255, 255, 1)",
            pointBorderWidth: 1,
            pointRadius: 2,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "rgba(255, 193, 7, 1)",
            pointHoverBorderColor: "rgba(255, 255, 255, 1)",
            pointHoverBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "white",
            bodyColor: "white",
            borderColor: "rgba(255, 193, 7, 1)",
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 14,
              weight: "bold",
            },
            bodyFont: {
              size: 13,
            },
            callbacks: {
              title: function (context) {
                const dataIndex = context[0].dataIndex * 7; // Account for sampling
                const originalIndex = Math.min(
                  dataIndex,
                  rollingSums.length - 1
                );
                const date = rollingSums[originalIndex].date;
                return new Date(date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
              },
              label: function (context) {
                const count = context.parsed.y;
                return `${count} contributions in rolling ${period}`;
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
              drawBorder: false,
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.7)",
              maxTicksLimit: 8,
            },
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
              drawBorder: false,
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.7)",
              stepSize: Math.max(1, Math.ceil(maxRolling / 6)),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  updateRollingStats(summary, period) {
    document.getElementById("peakRolling").textContent =
      summary.maxRolling.toLocaleString();
    document.getElementById("avgRolling").textContent =
      summary.avgRolling.toLocaleString();
    document.getElementById("accountAge").textContent = `${Math.floor(
      summary.accountAge / 365
    )} years`;
  }

  updateRollingPeriodDisplay(dateRange, period) {
    const periodName = this.getPeriodName(period);
    const fromDate = new Date(dateRange.from).toLocaleDateString();
    const toDate = new Date(dateRange.to).toLocaleDateString();

    document.getElementById(
      "rollingChartPeriod"
    ).textContent = `${periodName} rolling average since account creation (${fromDate} - ${toDate})`;
  }

  getPeriodName(period) {
    const periodNames = {
      "1week": "Weekly",
      "1month": "Monthly",
      "90day": "90-Day",
      "6month": "6-Month",
      "1year": "Yearly",
    };
    return periodNames[period] || "Monthly";
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new GitGraph();
});
