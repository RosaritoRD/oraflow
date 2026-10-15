const { google } = require('googleapis');
const { Logger } = require('../utils/logger');
const { ChannelLearningEngine } = require('../utils/channel-learning-engine');
const { subscriberConversion, subscriberGrowthSummary } = require('../utils/subscriber-conversion');

class AnalyticsOptimizationAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('AnalyticsOptimization');
    this.youtubeAnalytics = null;
    this.youtube = null;
    this.performanceData = new Map();
    this.learning = new ChannelLearningEngine(db);
  }

  async initialize() {
    this.logger.info('Initializing Analytics & Optimization Agent...');
    await this.setupAnalyticsAPI();
    await this.loadHistoricalData();
    return true;
  }

  async setupAnalyticsAPI() {
    try {
      const auth = this.credentials.getYouTubeAuth();
      this.youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
      this.youtube = google.youtube({ version: 'v3', auth });
      this.logger.info('YouTube Analytics API initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Analytics API:', error);
      throw error;
    }
  }

  async loadHistoricalData() {
    try {
      const history = await this.db.getAnalyticsHistory();
      history.forEach(record => {
        const analytics = { ...record.analytics };
        const sources = analytics.trafficSources?.sources;
        if (!analytics.simulated && Array.isArray(sources) && sources.every(s => Number.isFinite(s.views))) {
          analytics.trafficSources = this.summarizeTrafficSources(sources.map(s => [s.source, s.views]));
        }
        const seoMetrics = { ...record.seoMetrics };
        if (analytics.trafficSources) {
          seoMetrics.searchPerformance = this.analyzeSearchPerformance(analytics.trafficSources);
          if ([seoMetrics.titleScore, seoMetrics.descriptionScore, seoMetrics.tagScore].every(Number.isFinite)) {
            seoMetrics.recommendations = this.generateSEORecommendations(
              seoMetrics.titleScore, seoMetrics.descriptionScore, seoMetrics.tagScore, seoMetrics.searchPerformance
            );
          }
        }
        const normalized = {
          ...record,
          analytics,
          seoMetrics,
          videoId: record.videoId || record.video_id,
          analyzedAt: record.analyzedAt || record.analyzed_at,
          performance: record.analytics ? this.calculatePerformanceScore(analytics) : record.performance || {
            score: record.performance_score || 0,
            grade: record.performance_grade || 'N/A'
          }
        };
        const existing = this.performanceData.get(normalized.videoId);
        if (!existing || new Date(normalized.analyzedAt) > new Date(existing.analyzedAt)) {
          this.performanceData.set(normalized.videoId, normalized);
        }
      });
      if (this.db.getPublishedContentContext) {
        await Promise.all([...this.performanceData.values()].map(async report => {
          try {
            const context = await this.db.getPublishedContentContext(report.videoId);
            report.contentFormat = context.contentFormat || report.analytics?.contentFormat || null;
          } catch (_) {
            report.contentFormat = report.analytics?.contentFormat || null;
            this.logger.warn(`Publication format unavailable for ${report.videoId}`);
          }
        }));
      }
      this.logger.info(`Loaded ${this.performanceData.size} historical records`);
    } catch (error) {
      this.logger.warn('No historical analytics data found');
    }
  }

  async analyzeVideoPerformance(videoId, options = {}) {
    try {
      this.logger.info(`Analyzing performance for video: ${videoId}`);
      
      // Get video details
      const videoDetails = await this.getVideoDetails(videoId);
      
      const measurementWindow = options.measurementWindow || 'rolling';
      const period = this.learning.measurementPeriod(videoDetails.publishedAt, measurementWindow);

      // Get analytics data
      const channelStrategy = this.db.getChannelStrategy ? await this.db.getChannelStrategy() : null;
      const analytics = await this.getVideoAnalytics(videoId, period, {
        currency: channelStrategy?.outcome_currency || 'USD'
      });
      const context = await this.db.getPublishedContentContext(videoId);
      analytics.contentFormat = context.contentFormat || null;

      // Fetch the granular retention curve separately so its absence never
      // converts otherwise-real channel analytics into simulated data.
      const retention = analytics.simulated || analytics.available === false
        ? { available: false, simulated: true, reason: 'base_analytics_unavailable', points: [] }
        : await this.getAudienceRetention(videoId, period, videoDetails.duration);
      
      // Analyze thumbnail performance
      const thumbnailMetrics = await this.analyzeThumbnailPerformance(videoId, period);
      
      // Analyze title and SEO performance
      const seoMetrics = await this.analyzeSEOPerformance(videoDetails, analytics);
      
      // Generate insights and recommendations
      const insights = await this.generateInsights(videoDetails, analytics, thumbnailMetrics, seoMetrics);
      
      const performanceReport = {
        videoId,
        contentFormat: context.contentFormat || null,
        videoDetails,
        analytics,
        retention,
        thumbnailMetrics,
        seoMetrics,
        insights,
        performance: this.calculatePerformanceScore(analytics),
        measurementWindow,
        analyzedAt: new Date().toISOString()
      };
      
      // Store in performance data
      this.performanceData.set(videoId, performanceReport);
      
      // Save to database
      await this.db.saveAnalyticsReport(performanceReport);
      if (analytics.available !== false) {
        performanceReport.learningSnapshot = await this.learning.capture(
          performanceReport,
          context,
          measurementWindow
        );
      }
      if (retention.available) {
        performanceReport.retentionSnapshot = await this.learning.captureRetention(
          {
            ...retention,
            videoId,
            title: videoDetails.title,
            publishedAt: videoDetails.publishedAt
          },
          context,
          measurementWindow,
          {
            views: analytics.views?.totalViews,
            impressions: analytics.views?.totalImpressions
          }
        );
      }
      
      this.logger.info(`Analysis complete. Performance score: ${performanceReport.performance.score}/100`);
      return performanceReport;
    } catch (error) {
      this.logger.error(`Failed to analyze video ${videoId}:`, error);
      throw error;
    }
  }

  async getVideoDetails(videoId) {
    const response = await this.youtube.videos.list({
      part: 'snippet,statistics,contentDetails',
      id: videoId
    });
    
    if (!response.data.items.length) {
      throw new Error(`Video not found: ${videoId}`);
    }
    
    const video = response.data.items[0];
    return {
      id: videoId,
      title: video.snippet.title,
      description: video.snippet.description,
      tags: video.snippet.tags || [],
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      statistics: {
        viewCount: parseInt(video.statistics.viewCount) || 0,
        likeCount: parseInt(video.statistics.likeCount) || 0,
        commentCount: parseInt(video.statistics.commentCount) || 0
      }
    };
  }

  async getVideoAnalytics(videoId, period = null, options = {}) {
    const endDate = period?.endDate || new Date().toISOString().split('T')[0];
    const startDate = period?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const queries = {
      views: () => this.getViewsAnalytics(videoId, startDate, endDate),
      watchTime: () => this.getWatchTimeAnalytics(videoId, startDate, endDate),
      demographics: () => this.getDemographicsAnalytics(videoId, startDate, endDate),
      trafficSources: () => this.getTrafficSourcesAnalytics(videoId, startDate, endDate),
      devices: () => this.getDeviceAnalytics(videoId, startDate, endDate),
      outcomes: () => this.getOutcomeAnalytics(videoId, startDate, endDate, options.currency || 'USD'),
      engagement: () => this.calculateEngagementMetrics(videoId)
    };
    const keys = Object.keys(queries);
    const responses = await Promise.allSettled(keys.map(key => queries[key]()));
    const result = this.unavailableAnalytics({ startDate, endDate });
    responses.forEach((response, index) => {
      const key = keys[index];
      if (response.status === 'fulfilled') result[key] = response.value;
      else this.logger.warn(`${key} analytics unavailable for ${videoId}; preserving other measured metrics`);
    });
    result.unavailableMetrics = keys.filter(key => key === 'outcomes'
      ? !result.outcomes.subscribersAvailable && !result.outcomes.revenueAvailable
      : result[key].available === false);
    result.available = result.views.available !== false && Number.isFinite(result.views.totalViews);
    result.partial = result.unavailableMetrics.length > 0;
    return result;
  }

  async getViewsAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      // Sin impressions: Analytics v2 la rechaza y tumbaba toda la consulta (02/10/2026).
      metrics: 'views',
      dimensions: 'day',
      filters: `video==${videoId}`
    });
    
    const rows = response.data.rows || [];
    if (rows.some(row => !Number.isFinite(row[1]) || row[1] < 0)) throw new Error('Invalid views rows');
    return {
      available: rows.length > 0,
      totalViews: rows.length ? rows.reduce((sum, row) => sum + row[1], 0) : null,
      totalImpressions: 0,
      averageCTR: 0,
      impressionsAvailable: false,
      dailyData: rows
    };
  }

  async getWatchTimeAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
      filters: `video==${videoId}`
    });
    
    const row = response.data.rows?.[0];
    const available = Array.isArray(row) && row.length >= 3 && row.every(Number.isFinite);
    const data = available ? row : [null, null, null];
    
    return {
      available,
      totalWatchTime: data[0],
      averageViewDuration: data[1],
      averageViewPercentage: data[2],
      retentionQuality: available ? this.assessRetentionQuality(data[2]) : 'unknown'
    };
  }

  async getDemographicsAnalytics(videoId, startDate, endDate) {
    try {
      const [ageResponse, genderResponse] = await Promise.all([
        this.youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          dimensions: 'ageGroup',
          filters: `video==${videoId}`
        }),
        this.youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          dimensions: 'gender',
          filters: `video==${videoId}`
        })
      ]);
      
      return {
        available: Boolean(ageResponse.data.rows?.length && genderResponse.data.rows?.length),
        ageGroups: ageResponse.data.rows || [],
        gender: genderResponse.data.rows || [],
        primaryAudience: this.identifyPrimaryAudience(ageResponse.data.rows, genderResponse.data.rows)
      };
    } catch (error) {
      return { available: false, ageGroups: [], gender: [], primaryAudience: null };
    }
  }

  async getTrafficSourcesAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${videoId}`
    });
    
    return this.summarizeTrafficSources(response.data.rows || []);
  }

  summarizeTrafficSources(rows) {
    const sources = rows.filter(row => typeof row[0] === 'string' && Number.isFinite(row[1]) && row[1] >= 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const totalViews = sources.reduce((sum, row) => sum + row[1], 0);
    return {
      available: totalViews > 0,
      sources: sources.map(row => ({
        source: row[0],
        views: row[1],
        percentage: totalViews > 0 ? ((row[1] / totalViews) * 100).toFixed(1) : null
      })),
      topSource: totalViews > 0 ? sources[0][0] : 'unknown',
      organicPercentage: this.calculateOrganicPercentage(sources)
    };
  }

  async getDeviceAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'deviceType',
      filters: `video==${videoId}`
    });
    
    const devices = response.data.rows || [];
    const totalViews = devices.reduce((sum, row) => sum + row[1], 0);
    
    return {
      available: totalViews > 0,
      devices: devices.map(row => ({
        device: row[0],
        views: row[1],
        percentage: totalViews > 0 ? ((row[1] / totalViews) * 100).toFixed(1) : null
      })),
      mobilePercentage: totalViews > 0 ? this.calculateMobilePercentage(devices) : null
    };
  }

  async getOutcomeAnalytics(videoId, startDate, endDate, currency = 'USD') {
    const query = (metrics, includeCurrency = false, extra = {}) => this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics,
      filters: `video==${videoId}`,
      ...(includeCurrency ? { currency } : {}),
      ...extra
    });
    const [subscriberResult, revenueResult] = await Promise.allSettled([
      query('views,engagedViews,subscribersGained,subscribersLost', false, { dimensions: 'day', sort: 'day' }),
      query('estimatedRevenue,monetizedPlaybacks,playbackBasedCpm', true)
    ]);
    const measuredRow = (result, count) => {
      const row = result.status === 'fulfilled' ? result.value.data.rows?.[0] : null;
      return Array.isArray(row) && row.length >= count && row.slice(0, count).every(Number.isFinite)
        ? row.slice(0, count) : null;
    };
    const conversion = subscriberConversion(
      subscriberResult.status === 'fulfilled' ? subscriberResult.value.data.rows : [], { startDate, endDate }
    );
    const subscribers = conversion.available ? [conversion.subscribersGained, conversion.subscribersLost] : null;
    const revenue = measuredRow(revenueResult, 3);
    if (!subscribers) this.logger.info(`Subscriber outcomes unavailable for ${videoId}; no measured subscriber row`);
    if (!revenue) this.logger.info(`Revenue outcomes unavailable for ${videoId}; monetization data will remain unavailable`);
    return {
      conversion,
      subscribersAvailable: Boolean(subscribers),
      subscribersGained: subscribers ? Number(subscribers[0] || 0) : null,
      subscribersLost: subscribers ? Number(subscribers[1] || 0) : null,
      netSubscribers: subscribers ? Number(subscribers[0] || 0) - Number(subscribers[1] || 0) : null,
      revenueAvailable: Boolean(revenue),
      currency: revenue ? currency : null,
      estimatedRevenue: revenue ? Number(revenue[0] || 0) : null,
      monetizedPlaybacks: revenue ? Number(revenue[1] || 0) : null,
      playbackBasedCpm: revenue ? Number(revenue[2] || 0) : null
    };
  }

  async calculateEngagementMetrics(videoId) {
    const videoDetails = await this.getVideoDetails(videoId);
    const stats = videoDetails.statistics;
    
    const views = stats.viewCount || 0;
    const likes = stats.likeCount || 0;
    const comments = stats.commentCount || 0;
    const interactions = likes + comments;
    const engagementRate = views > 0 ? (interactions / views) * 100 : 0;
    const likeRatio = interactions > 0 ? (likes / interactions) * 100 : 0;
    const commentsPerView = views > 0 ? (comments / views) * 100 : 0;
    
    return {
      available: views > 0,
      engagementRate: views > 0 ? parseFloat(engagementRate.toFixed(2)) : null,
      likeRatio: parseFloat(likeRatio.toFixed(2)),
      commentsPerView: commentsPerView.toFixed(4),
      engagementQuality: views > 0 ? this.assessEngagementQuality(engagementRate) : 'unknown'
    };
  }

  async analyzeThumbnailPerformance(videoId, period = null) {
    // Las impresiones y el CTR de la miniatura no están en YouTube Analytics v2 para
    // este canal («Unknown identifier» / «query is not supported», probado 02/10/2026):
    // solo se ven en YouTube Studio. No se consulta para no ensuciar el registro.
    return {
      available: false,
      impressions: 0,
      clickThroughRate: 0,
      ctrQuality: 'unknown',
      recommendations: ['CTR de miniatura: consultarlo en YouTube Studio (la API no lo da)']
    };
  }


  async analyzeSEOPerformance(videoDetails, analytics) {
    const title = videoDetails.title;
    const description = videoDetails.description;
    const tags = videoDetails.tags;
    
    // Analyze title effectiveness
    const titleScore = this.scoreTitleEffectiveness(title, analytics.views.totalViews);
    
    // Analyze description optimization
    const descriptionScore = this.scoreDescriptionOptimization(description);
    
    // Analyze tag relevance
    const tagScore = this.scoreTagRelevance(tags, title);
    
    // Search performance
    const searchPerformance = this.analyzeSearchPerformance(analytics.trafficSources);
    
    return {
      titleScore,
      descriptionScore,
      tagScore,
      searchPerformance,
      overallSEOScore: Math.round((titleScore + descriptionScore + tagScore) / 3),
      recommendations: this.generateSEORecommendations(titleScore, descriptionScore, tagScore, searchPerformance)
    };
  }

  async generateInsights(videoDetails, analytics, thumbnailMetrics, seoMetrics) {
    const insights = [];
    if (analytics.simulated || analytics.available === false || analytics.views?.available === false || !(analytics.views?.totalViews > 0)) return insights;
    const retentionAvailable = this.hasRetention(analytics);
    const ctrAvailable = thumbnailMetrics.available !== false &&
      thumbnailMetrics.ctrQuality !== 'unknown' && Number.isFinite(thumbnailMetrics.clickThroughRate);
    
    // Performance insights
    if (analytics.views.totalViews > 10000) {
      insights.push({
        type: 'success',
        category: 'views',
        message: 'Video is performing above average in terms of views',
        impact: 'high'
      });
    } else if (analytics.views.totalViews < 1000) {
      insights.push({
        type: 'warning',
        category: 'views',
        message: 'Video views are below expected threshold',
        impact: 'high',
        recommendation: 'Consider promoting the video or optimizing SEO'
      });
    }
    
    // Retention insights
    if (retentionAvailable && analytics.watchTime.averageViewPercentage > 50) {
      insights.push({
        type: 'success',
        category: 'retention',
        message: 'Excellent audience retention rate',
        impact: 'medium'
      });
    } else if (retentionAvailable && analytics.watchTime.averageViewPercentage < 30) {
      insights.push({
        type: 'critical',
        category: 'retention',
        message: 'Poor audience retention - viewers are dropping off early',
        impact: 'high',
        recommendation: 'Review content structure and pacing'
      });
    }
    
    // Thumbnail insights
    if (ctrAvailable && thumbnailMetrics.clickThroughRate > 8) {
      insights.push({
        type: 'success',
        category: 'thumbnail',
        message: 'Thumbnail is highly effective at driving clicks',
        impact: 'high'
      });
    } else if (ctrAvailable && thumbnailMetrics.clickThroughRate < 3) {
      insights.push({
        type: 'warning',
        category: 'thumbnail',
        message: 'Thumbnail may not be compelling enough',
        impact: 'high',
        recommendation: 'Consider A/B testing different thumbnail designs'
      });
    }
    
    // SEO insights
    if (seoMetrics.overallSEOScore > 80) {
      insights.push({
        type: 'success',
        category: 'seo',
        message: 'Video is well-optimized for search',
        impact: 'medium'
      });
    } else if (seoMetrics.overallSEOScore < 50) {
      insights.push({
        type: 'warning',
        category: 'seo',
        message: 'SEO optimization needs improvement',
        impact: 'medium',
        recommendation: 'Optimize title, description, and tags'
      });
    }
    
    // Engagement insights
    const engagementAvailable = analytics.engagement?.available !== false && Number.isFinite(analytics.engagement?.engagementRate);
    if (engagementAvailable && analytics.engagement.engagementRate > 5) {
      insights.push({
        type: 'success',
        category: 'engagement',
        message: 'High audience engagement',
        impact: 'medium'
      });
    } else if (engagementAvailable && analytics.engagement.engagementRate < 1) {
      insights.push({
        type: 'warning',
        category: 'engagement',
        message: 'Low audience engagement',
        impact: 'medium',
        recommendation: 'Encourage more interaction in future videos'
      });
    }
    
    return insights;
  }

  calculatePerformanceScore(analytics) {
    if (analytics.simulated || analytics.available === false || analytics.views?.available === false || !(analytics.views?.totalViews > 0)) {
      return { score: null, grade: 'N/A', breakdown: { views: null, retention: null, engagement: null, ctr: null } };
    }
    let score = 0;
    let maxScore = 0;
    
    // Views score (30 points max)
    const viewsScore = Math.min(30, (analytics.views.totalViews / 10000) * 30);
    score += viewsScore;
    maxScore += 30;
    
    // Retention score (25 points max)
    const retentionScore = this.hasRetention(analytics)
      ? Math.min(25, Math.max(0, (analytics.watchTime.averageViewPercentage / 100) * 25)) : null;
    if (retentionScore !== null) { score += retentionScore; maxScore += 25; }
    
    // Engagement score (25 points max)
    const engagementScore = analytics.engagement?.available !== false && Number.isFinite(analytics.engagement?.engagementRate)
      ? Math.min(25, Math.max(0, analytics.engagement.engagementRate * 5)) : null;
    if (engagementScore !== null) { score += engagementScore; maxScore += 25; }
    
    // CTR score (20 points max)
    const ctrScore = analytics.views.impressionsAvailable !== false && Number.isFinite(analytics.views.averageCTR)
      ? Math.min(20, Math.max(0, analytics.views.averageCTR * 2)) : null;
    if (ctrScore !== null) { score += ctrScore; maxScore += 20; }
    
    const finalScore = Math.round((score / maxScore) * 100);
    
    return {
      score: finalScore,
      breakdown: {
        views: Math.round(viewsScore),
        retention: retentionScore === null ? null : Math.round(retentionScore),
        engagement: engagementScore === null ? null : Math.round(engagementScore),
        ctr: ctrScore === null ? null : Math.round(ctrScore)
      },
      grade: this.getPerformanceGrade(finalScore)
    };
  }

  getPerformanceGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  // Helper methods
  hasRetention(analytics) {
    return !analytics.simulated && analytics.available !== false && analytics.views?.available !== false && analytics.views?.totalViews > 0 &&
      analytics.watchTime?.available !== false && Number.isFinite(analytics.watchTime?.averageViewPercentage);
  }

  scoredReports(reports) {
    return reports.filter(report => !report.analytics?.simulated && report.analytics?.available !== false && report.analytics?.views?.available !== false &&
      report.analytics?.views?.totalViews > 0 && Number.isFinite(report.performance?.score));
  }

  calculateAverage(values) {
    if (!values.length) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  assessRetentionQuality(percentage) {
    if (percentage > 60) return 'excellent';
    if (percentage > 40) return 'good';
    if (percentage > 25) return 'average';
    return 'poor';
  }

  assessEngagementQuality(rate) {
    if (rate > 8) return 'excellent';
    if (rate > 5) return 'good';
    if (rate > 2) return 'average';
    return 'poor';
  }

  assessCTRQuality(ctr) {
    if (ctr > 10) return 'excellent';
    if (ctr > 6) return 'good';
    if (ctr > 3) return 'average';
    return 'poor';
  }

  scoreTitleEffectiveness(title, views) {
    let score = 0;
    
    // Length check
    if (title.length >= 50 && title.length <= 70) score += 20;
    else if (title.length >= 40 && title.length <= 80) score += 15;
    else score += 10;
    
    // Power words
    const powerWords = ['ultimate', 'complete', 'secret', 'amazing', 'shocking', 'incredible'];
    if (powerWords.some(word => title.toLowerCase().includes(word))) score += 15;
    
    // Numbers
    if (/\d+/.test(title)) score += 10;
    
    // Emotional triggers
    const emotionalWords = ['how', 'why', 'what', 'best', 'worst', 'never', 'always'];
    if (emotionalWords.some(word => title.toLowerCase().includes(word))) score += 15;
    
    // Performance correlation
    if (views > 10000) score += 20;
    else if (views > 1000) score += 10;
    
    return Math.min(100, score);
  }

  scoreDescriptionOptimization(description) {
    let score = 0;
    
    if (description.length > 200) score += 20;
    if (description.includes('http')) score += 15; // Has links
    if (description.includes('TIMESTAMP') || description.includes('00:')) score += 15; // Has timestamps
    if (description.split('\n').length > 5) score += 15; // Well formatted
    if (description.length > 500) score += 10; // Comprehensive
    
    // Keyword density check (simplified)
    const wordCount = description.split(' ').length;
    if (wordCount > 100) score += 15;
    
    return Math.min(100, score);
  }

  scoreTagRelevance(tags, title) {
    let score = 0;
    
    if (tags.length >= 10) score += 20;
    if (tags.length >= 5) score += 10;
    
    // Tag-title relevance
    const titleWords = title.toLowerCase().split(' ');
    const relevantTags = tags.filter(tag => 
      titleWords.some(word => tag.toLowerCase().includes(word))
    );
    
    if (relevantTags.length > 0) {
      score += (relevantTags.length / tags.length) * 30;
    }
    
    // Long-tail keywords
    const longTailTags = tags.filter(tag => tag.split(' ').length > 2);
    if (longTailTags.length > 0) score += 20;
    
    return Math.min(100, score);
  }

  analyzeSearchPerformance(trafficSources) {
    const sources = trafficSources?.sources || [];
    const available = trafficSources?.available !== false && sources.some(s => Number.isFinite(parseFloat(s.percentage)));
    const searchSources = sources.filter(source =>
      ['YT_SEARCH', 'SEARCH', 'YOUTUBE_SEARCH'].includes(source.source)
    );
    
    const searchPercentage = searchSources.reduce((sum, source) => 
      sum + (parseFloat(source.percentage) || 0), 0
    );
    
    return {
      available,
      searchPercentage: available ? searchPercentage : null,
      searchQuality: !available ? 'unknown' : searchPercentage > 20 ? 'good' : searchPercentage > 10 ? 'average' : 'poor',
      organicDiscovery: available ? searchPercentage > 30 : null
    };
  }

  generateThumbnailRecommendations(ctr) {
    if (ctr > 8) return ['Thumbnail is performing excellently', 'Consider using similar design elements in future thumbnails'];
    if (ctr > 5) return ['Good thumbnail performance', 'Minor optimizations may help'];
    if (ctr > 3) return ['Average performance', 'Test brighter colors or more contrasting text'];
    return ['Poor thumbnail performance', 'Consider A/B testing', 'Use more compelling imagery', 'Increase text contrast'];
  }

  generateSEORecommendations(titleScore, descriptionScore, tagScore, searchPerformance) {
    const recommendations = [];
    
    if (titleScore < 70) {
      recommendations.push('Optimize title with power words and emotional triggers');
    }
    
    if (descriptionScore < 60) {
      recommendations.push('Improve description with timestamps, links, and detailed content');
    }
    
    if (tagScore < 50) {
      recommendations.push('Use more relevant tags and long-tail keywords');
    }
    
    if (searchPerformance.available !== false && searchPerformance.searchPercentage < 15) {
      recommendations.push('Focus on search optimization to improve organic discovery');
    }
    
    return recommendations;
  }

  unavailableAnalytics(period = null) {
    return {
      simulated: false, available: false, partial: true, period,
      views: { available: false, totalViews: null, totalImpressions: null, averageCTR: null, impressionsAvailable: false, dailyData: [] },
      watchTime: { available: false, totalWatchTime: null, averageViewDuration: null, averageViewPercentage: null, retentionQuality: 'unknown' },
      engagement: { available: false, engagementRate: null, likeRatio: null, commentsPerView: null, engagementQuality: 'unknown' },
      demographics: { available: false, ageGroups: [], gender: [], primaryAudience: null },
      trafficSources: this.summarizeTrafficSources([]),
      devices: { available: false, devices: [], mobilePercentage: null },
      outcomes: {
        subscribersAvailable: false, subscribersGained: null, subscribersLost: null,
        netSubscribers: null, revenueAvailable: false, estimatedRevenue: null,
        monetizedPlaybacks: null, playbackBasedCpm: null
      }
    };
  }

  getSimulatedAnalytics(_videoId) {
    return { ...this.unavailableAnalytics(), simulated: true };
  }

  getSimulatedDemographics() {
    return {
      ageGroups: [['18-24', 30], ['25-34', 40], ['35-44', 20]],
      gender: [['male', 60], ['female', 40]],
      primaryAudience: 'Males 25-34'
    };
  }

  identifyPrimaryAudience(ageGroups, gender) {
    const highest = rows => (rows || []).filter(row => Number.isFinite(row[1]) && row[1] > 0)
      .reduce((best, row) => !best || row[1] > best[1] ? row : best, null)?.[0];
    const topAge = highest(ageGroups);
    const topGender = highest(gender);
    if (!topAge || !topGender) return null;
    return `${topGender}s ${topAge}`;
  }

  calculateOrganicPercentage(sources) {
    // Indicador histórico de la aplicación: cuota de búsquedas + vídeos relacionados.
    // No representa todo el tráfico no pagado (por ejemplo, el feed Shorts).
    const organicSources = ['YT_SEARCH', 'RELATED_VIDEO', 'SEARCH', 'YOUTUBE_SEARCH', 'SUGGESTED_VIDEO'];
    const total = sources.reduce((sum, row) => sum + row[1], 0);
    const organic = sources
      .filter(row => organicSources.includes(row[0]))
      .reduce((sum, row) => sum + row[1], 0);
    return total > 0 ? Number(((organic / total) * 100).toFixed(1)) : null;
  }

  calculateMobilePercentage(devices) {
    const mobileDevices = devices.filter(row => 
      ['MOBILE', 'TABLET'].includes(row[0])
    );
    const total = devices.reduce((sum, row) => sum + row[1], 0);
    const mobile = mobileDevices.reduce((sum, row) => sum + row[1], 0);
    
    return total > 0 ? ((mobile / total) * 100).toFixed(1) : '0';
  }

  async getRecentAnalytics(days = 7) {
    const recentReports = Array.from(this.performanceData.values())
      .filter(report => {
        const reportDate = new Date(report.analyzedAt);
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return reportDate > cutoffDate;
      })
      .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
    
    return {
      totalVideos: recentReports.length,
      subscriberGrowth: subscriberGrowthSummary(recentReports),
      averagePerformanceScore: this.calculateAverageScore(recentReports),
      topPerformers: this.scoredReports(recentReports).sort((a, b) => b.performance.score - a.performance.score).slice(0, 5),
      insights: this.generateChannelInsights(recentReports)
    };
  }

  async getAudienceRetention(videoId, period = null, isoDuration = null) {
    const endDate = period?.endDate || new Date().toISOString().split('T')[0];
    const startDate = period?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      const response = await this.youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'audienceWatchRatio,relativeRetentionPerformance,startedWatching,stoppedWatching,totalSegmentImpressions',
        dimensions: 'elapsedVideoTimeRatio',
        filters: `video==${videoId}`
      });
      const headers = (response.data.columnHeaders || []).map(header => header.name);
      const index = name => headers.indexOf(name);
      const value = (row, name) => {
        const position = index(name);
        return position >= 0 ? Number(row[position] || 0) : 0;
      };
      const points = (response.data.rows || []).map(row => ({
        elapsedRatio: value(row, 'elapsedVideoTimeRatio'),
        audienceWatchRatio: value(row, 'audienceWatchRatio'),
        relativeRetentionPerformance: value(row, 'relativeRetentionPerformance'),
        startedWatching: value(row, 'startedWatching'),
        stoppedWatching: value(row, 'stoppedWatching'),
        totalSegmentImpressions: value(row, 'totalSegmentImpressions')
      })).filter(point => point.elapsedRatio > 0);
      return {
        available: points.length > 0,
        simulated: false,
        reason: points.length ? null : 'no_retention_rows',
        period: { startDate, endDate },
        durationSeconds: this.parseISODurationSeconds(isoDuration),
        points
      };
    } catch (error) {
      this.logger.warn(`Audience retention curve unavailable for ${videoId}: ${error.message}`);
      return { available: false, simulated: false, reason: 'retention_api_unavailable', points: [] };
    }
  }

  parseISODurationSeconds(value) {
    const match = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
    if (!match) return 0;
    return Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  }

  getLearningSummary() {
    return this.learning.getSummary();
  }

  getDueMeasurementWindows(video) {
    return this.learning.getDueMeasurementWindows(video);
  }

  calculateAverageScore(reports) {
    reports = this.scoredReports(reports);
    if (!reports.length) return 0;
    const total = reports.reduce((sum, report) => sum + report.performance.score, 0);
    return Math.round(total / reports.length);
  }

  generateChannelInsights(reports) {
    reports = this.scoredReports(reports);
    if (!reports.length) return [];
    
    const insights = [];
    const avgScore = this.calculateAverageScore(reports);
    
    if (avgScore > 80) {
      insights.push('Channel is performing excellently across all metrics');
    } else if (avgScore < 50) {
      insights.push('Channel performance needs significant improvement');
    }
    
    // Analyze common issues
    const retentionReports = reports.filter(r => this.hasRetention(r.analytics));
    const lowRetentionVideos = retentionReports.filter(r =>
      r.analytics.watchTime.averageViewPercentage < 30
    ).length;
    
    if (lowRetentionVideos > retentionReports.length * 0.5) {
      insights.push('Multiple videos showing poor retention - review content quality');
    }
    
    return insights;
  }
}

module.exports = { AnalyticsOptimizationAgent };
