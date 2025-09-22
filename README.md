# GitGraph 📊

A beautiful, interactive GitHub contribution tracker that displays your coding activity with rolling time periods. Perfect for monitoring your GitHub streak and visualizing your development journey!

![GitGraph Demo](https://img.shields.io/badge/GitGraph-Interactive_GitHub_Tracker-blue?style=for-the-badge&logo=github)

## ✨ Features

- **Interactive Line Chart**: Beautiful Chart.js visualization of daily contributions
- **Contribution Heatmap**: GitHub-style contribution calendar with hover tooltips
- **Multiple Time Periods**: View contributions for different rolling periods
  - 1 Week
  - 1 Month
  - 90 Days
  - 6 Months
  - 1 Year
- **Real-time Statistics**: Track total commits, active days, PRs, and current streak
- **Responsive Design**: Beautiful UI that works on desktop and mobile
- **Live Data**: Fetches real-time data from GitHub API
- **Modern UI**: Glass-morphism design with smooth animations

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- GitHub Personal Access Token

### Installation

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd gitgraph
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   GITHUB_TOKEN=your_github_personal_access_token
   GITHUB_USERNAME=your_github_username
   PORT=3000
   ```

4. **Create GitHub Personal Access Token**

   - Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Give it a descriptive name like "GitGraph App"
   - Select the following scopes:
     - `read:user` (to access your profile information)
   - Copy the token and add it to your `.env` file

5. **Start the application**

   ```bash
   npm start
   ```

6. **Open your browser**

   Navigate to `http://localhost:3000` to view your GitHub contributions!

## 🛠️ Development

### Development Mode

For development with auto-restart on file changes:

```bash
npm run dev
```

### Project Structure

```
gitgraph/
├── server.js          # Express server with GitHub API integration
├── package.json       # Project dependencies and scripts
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore file
├── LICENSE            # GPL-3.0 License
├── README.md          # This file
└── public/            # Frontend assets
    ├── index.html     # Main HTML structure
    ├── styles.css     # CSS styling with glass-morphism design
    └── app.js         # JavaScript for interactivity and charts
```

### API Endpoints

- `GET /` - Serve the main application
- `GET /api/user` - Get GitHub user information
- `GET /api/contributions/:period` - Get contributions for specified period
- `GET /health` - Health check endpoint

### Available Time Periods

- `1week` - Past 7 days
- `1month` - Past 30 days
- `90day` - Past 90 days
- `6month` - Past 180 days
- `1year` - Past 365 days

## 📊 Features in Detail

### Interactive Chart

- Smooth line chart showing daily contribution count
- Hover tooltips with detailed information
- Responsive design that adapts to screen size
- Beautiful color gradient and animations

### Contribution Heatmap

- GitHub-style calendar heatmap
- Color-coded contribution levels
- Hover tooltips showing exact dates and counts
- Scrollable for longer time periods

### Statistics Dashboard

- **Total Commits**: Overall commit count for the selected period
- **Active Days**: Number of days with at least one contribution
- **Pull Requests**: Total PRs created in the period
- **Current Streak**: Current consecutive days of contributions

### Real-time Updates

- Refresh button to get latest data
- Automatic error handling and retry mechanisms
- Loading states with smooth transitions

## 🎨 Customization

### Changing Colors

Edit the CSS variables in `public/styles.css`:

```css
/* Example color modifications */
.stat-icon.commits {
  background: linear-gradient(45deg, #your-color-1, #your-color-2);
}
```

### Adding New Time Periods

1. Add the period to the dropdown in `public/index.html`
2. Add the period logic in `server.js` `getDateRange()` function
3. Add the display name in `public/app.js` `updatePeriodDisplay()` function

## 🔧 Troubleshooting

### Common Issues

**1. "Missing required environment variables" error**

- Make sure you have created a `.env` file with `GITHUB_TOKEN` and `GITHUB_USERNAME`
- Verify your GitHub token has the correct permissions

**2. "Failed to fetch contributions" error**

- Check that your GitHub token is valid and not expired
- Ensure your username is spelled correctly
- Verify you have an internet connection

**3. Chart not displaying**

- Check browser console for JavaScript errors
- Ensure all dependencies are installed (`npm install`)
- Try refreshing the page

### Development Tips

- Use the browser's developer tools to debug API calls
- Check the Network tab to see if API requests are successful
- The server logs will show detailed error messages

## 📈 GitHub API Rate Limits

The application uses GitHub's GraphQL API, which has the following rate limits:

- 5,000 requests per hour for authenticated requests
- Each query in this app counts as 1 request
- Rate limit resets every hour

For normal usage, you shouldn't hit these limits, but if you do:

- Wait for the rate limit to reset
- Consider caching data on the backend for high-traffic scenarios

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Chart.js](https://www.chartjs.org/) for the beautiful charts
- [GitHub API](https://docs.github.com/en/graphql) for providing contribution data
- [Font Awesome](https://fontawesome.com/) for the icons

---

**Happy coding! Keep that GitHub streak alive! 🔥**

