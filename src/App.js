import React, { Component } from 'react';
import './App.css';
import distanceInWords from 'date-fns/distance_in_words';
import differenceInDays from 'date-fns/difference_in_days';
import Tooltip from 'react-tooltip-lite';

class App extends Component {
  constructor() {
    super();
    const options = JSON.parse(localStorage.getItem('prwallconfig')) || {};
    const defaults = {
      access_token: '',
      repo: '',
      refreshIntervalInMinutes: 2,
      daysForOldMark: 3,
      emoji: 'no',
      vertical: 'vertical',
      team: '',
      notifications: 'no',
      notification_icon: '',
      font_size: 16,
      repo_order: 'default'
    }

    this.state = {
      error: false,
      bootstraped: false,
      reviewsFetchFired: false,
      prData: {},
      prReviews: {},
      mergeable: {},
      comments: {},
      teamMembers: [],
    }
    this.config = {...defaults, ...options}
    this.handleError = this.handleError.bind(this);
    this.showConfig = this.showConfig.bind(this);
    this.hideConfig = this.hideConfig.bind(this);

    this.counter = 0;
  }
  changeFontSize() {
    let html = document.getElementsByTagName('html')[0];
    html.style.fontSize = this.config.font_size +'px';
  }
  getNotificationPermission() {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission().then(result => console.info('notifications ' + result))
    }
  }
  notifyNewPR(newPRs) {
    newPRs.forEach(pr => {
      const title = pr.title;
      const options = {
        body: pr.user.login,
        icon: pr.user.avatar_url,
        requireInteraction: true
      };
      if (this.config.notification_icon !== '') options.icon = this.config.notification_icon;
      new Notification(title, options);
    });
  }
  checkNewPR(newData, oldPRs) {
    if(newData !== undefined) { 
      const newPRs = this.arraysDiff('id', newData, oldPRs);
      if(newPRs.length > 0) this.notifyNewPR(newPRs);
    }
  }
  arraysDiff(key, newData, oldPRs) {
    return newData.filter(res => !oldPRs.find(res2 => res[key] === res2[key]));
  }
  orderRepos(prData) {
    let repos = this.config.repo.split(',').sort((a, b) => {
      a = prData[a.trim()].length;
      b = prData[b.trim()].length;

      if (this.config.repo_order.toLowerCase() === 'asc') {
        return a === b ? 0 : a < b ? -1 : 1; 
      } else {
        return a === b ? 0 : a > b ? -1 : 1; 
      }
    });

    this.config.repo = repos.join();
  }
  getUrl(repo, type, pullURL) {
    /* Example:
    ** https://developer.github.com/v3/pulls/
    ** GET /repos/:owner/:repo/pulls
    ** ?access_token=:acces_token
    */
    const base = repo ? `https://api.github.com/repos/${repo}/pulls` : pullURL;
    let requestPath = ''
    
    if (type === 'reviews') {
      requestPath = '/reviews'
    }

    if (this.config.access_token) {
      requestPath += `?access_token=${this.config.access_token}`
    }

    return base + requestPath;
  }
  fetchPullRequests() {
    const tempPRData = {};
    if(this.state.prData !== undefined) Object.assign(tempPRData, this.state.prData);
    this.config.repo.split(',').forEach((repo) => {
      const repoName = repo.trim();
      fetch(this.getUrl(repoName))
      .then(response => {
        return response.json()
      })
      .then((data) => { 
        if (!data || data.message) {
          this.handleError(data);
        } else {
          this.setState((prevState) => {
            const newStatePRData = {...prevState.prData}
            newStatePRData[repoName] = data.filter(pr => {
              if (this.state.teamMembers.length === 0) {
                return true;
              }
              return this.state.teamMembers.includes(pr.user.login)
            });
            if (Notification.permission === 'granted' && this.config.notifications === 'yes' && Object.keys(tempPRData).length > 0) {
                this.checkNewPR(data, tempPRData[repoName]);
            }

            if (this.config.vertical !== 'vertical' && this.config.repo_order.toLowerCase() !== 'default') {
              this.counter++;
              if (this.config.repo.split(',').length === this.counter) {
                this.orderRepos(newStatePRData);
                this.counter = 0;
              }
            }

            return { error: false, bootstraped: true, prData:newStatePRData, prReviews: {}, reviewsFetchFired: false}
          });
        }
      })
      .catch((error) => {
        this.handleError(error)
      })
    });
  }

  startFetching() {
    this.fetchPullRequests();
    this.timer = window.setInterval(this.fetchPullRequests.bind(this), this.config.refreshIntervalInMinutes*60*1000);
  }

  async fetchOrgTeams(page = 1) {
    const teamOrg = this.config.team.split('/')[0];
    let responseData = [];

    await fetch(`https://api.github.com/orgs/${teamOrg}/teams?access_token=${this.config.access_token}&page=${page}`)
    .then(response => response.json())
    .then((data) => {
        if (!data || data.message) {
          this.handleError('No teams found!');
        }
        responseData = data;
    });
    
    if (responseData.length > 0) {
      const newData = await this.fetchOrgTeams(++page);
      responseData = responseData.concat(newData)
    } 

    return responseData;
  }

  async getTeamInfo() {
    return await this.fetchOrgTeams();
  }

  setTeamInfo() {
    this.getTeamInfo()
    .then((teams) => {
      const targetTeam = teams
        .find(team => team.slug === this.config.team.split('/')[1]);
      
      if (!targetTeam) {
        this.handleError('No team found!')
      } else {
        fetch(`https://api.github.com/teams/${targetTeam.id}/members?access_token=${this.config.access_token}`)
        .then(response => response.json())
        .then((data) => {
          const teamMembers = Array.isArray(data) && data.map(member => member.login);
          this.setState({teamMembers});
          !this.timer && this.startFetching();
        });
      }
    });
  }

  componentDidMount() {
    if (this.config.repo) {
      if (this.config.team) {
        this.setTeamInfo();
        // check team info every 24 hours
        window.setInterval(this.setTeamInfo.bind(this), 24*60*60*1000);
      } else {
        this.startFetching();
      }
    }

    if (this.config.notifications === 'yes' && Notification.permission !== 'denied') this.getNotificationPermission();
    this.changeFontSize();
  }

  componentDidUpdate() {
    // Fetch aditional reviews data only when there hasn't been fired request for it already
    if (!this.state.reviewsFetchFired && Object.keys(this.state.prData).length > 0) {
      Object.keys(this.state.prData).forEach((repoName) => {
        this.state.prData[repoName].forEach((pr) => {
          fetch(this.getUrl(undefined, 'reviews', pr.url))
          .then(response => response.json())
          .then((data) => {
            if (data.message) {
              this.handleError(data);
            } else {
              const reviews = {
                ...this.state.prReviews,
                [repoName + '_' + pr.number]: data
              }
              this.setState( {prReviews: reviews} );
            }
          })
          .catch((error) => this.handleError(error))

          fetch(this.getUrl(undefined, 'pull', pr.url))
          .then(response => response.json())
          .then((data) => {
            if (data.message) {
              this.handleError(data);
            } else {
              this.setState((state) => {
                let mergeable = {...state.mergeable}
                mergeable[repoName + '_' + pr.number] = {}
                mergeable[repoName + '_' + pr.number].mergeable = data.mergeable
                mergeable[repoName + '_' + pr.number].mergeable_state = data.mergeable_state

                let comments = {...state.comments}
                comments[repoName + '_' + pr.number] = 0
                comments[repoName + '_' + pr.number] = data.comments + data.review_comments;

                return { mergeable, comments }
              })
            }
          })
          .catch((error) => this.handleError(error))
        })
     })

      this.setState( {reviewsFetchFired: true} );
    }
  }
  handleError(error) {
    console.warn(error);
    this.setState({error: true, bootstraped: true})
  }

  displayError() {
    return this.state.error
    ? <div className="error">Error occured. Possible issue: API limit rate exceeded or service down or access_token not permitted or repo not found. If you reach API limit, it is good to raise the refresh rate interval to higher number. Check console/network.</div>
    : ''
  }

  renderEmoji(numOfComments) {
    if (this.config.emoji === 'no') {
      return ''
    }
    let emoji = '😀';
    if (numOfComments > 0 && numOfComments < 3) {
      emoji = '🙄';
    }
    if (numOfComments > 2 && numOfComments < 6) {
      emoji = '😐';
    }
    if (numOfComments > 5 && numOfComments < 11) {
      emoji = '🙈';
    }
    if (numOfComments > 10 && numOfComments < 21) {
      emoji = '😱';
    }
    if (numOfComments > 20) {
      emoji = '💩';
    }
    return <span role="img" aria-label="feeling based on comments">{emoji}</span>
  }

  renderPR(repo, pr) {
    const decideOldClass = (pr) => {
      const maxDays = this.config.daysForOldMark; // old if more than 7 days
      let oldClass = '';
      
      if(differenceInDays(new Date(),new Date(pr.updated_at)) >= maxDays) {
        oldClass = 'old';
      }

      return oldClass;
    }

    const mergeable = this.state.mergeable[repo + '_' + pr.number]
      && this.state.mergeable[repo + '_' + pr.number].mergeable 
      && this.state.mergeable[repo + '_' + pr.number].mergeable_state === 'clean' ? ' mergeable' : '';

    const numOfComments = this.state.comments[repo + '_' + pr.number];

    return (
      <div key={pr.number} className={`pull-request-wrap ${decideOldClass(pr)}  ${mergeable}`}>
        <div className="pull-request-title">
          <span className="pull-request-user"><img src={pr.user.avatar_url} title={pr.user.login} alt="user"/></span>
          <span className="pull-request-state">{pr.state}</span>
          <span>{pr.title}</span>
        </div>
        <div className="pull-request-meta">
          <div>
            <span className="pull-request-number">
              <a href={pr.html_url} rel="noopener noreferrer" target="_blank">{pr.number}</a>
            </span> 
            <span>Updated: <span className="pull-request-ago">{distanceInWords(new Date(), new Date(pr.updated_at))}</span> ago.</span>
          </div>
          <div>
            <div className="review_comments"><span role="img" aria-label="comments:">💬</span> {numOfComments} {this.renderEmoji(numOfComments)}</div>
            {this.renderReviews(repo, pr.number)}
          </div>
          </div>
      </div>
    )
  }
  saveConfig() {
    const configElems = document.querySelectorAll('input, select')
    const configToSave = {}

    configElems.forEach((input) => {
      configToSave[input.name] = input.value
    })

    localStorage.setItem('prwallconfig', JSON.stringify(configToSave))
    window.location.reload();
  }

  showConfig () { this.setState({showConfig: true})}

  hideConfig () { this.setState({showConfig: false})}

  renderConfig() {
    if (!this.state.showConfig) {
      return <div className="show" onClick={this.showConfig}>Show Config</div>
    }
    return (
      <div className="config">
        <div className="hide" onClick={this.hideConfig}>hide config</div>
        <div className="app-name"><img src={process.env.PUBLIC_URL + '/app-icon.png'} alt="app-icon"/> <span>Github PR Wall montior</span></div>
        <form>
          <ul>
          <li>
            <input type="text" name="access_token" id="access_token" placeholder="access_token" defaultValue={this.config.access_token}/>
            <span><strong>Access token: </strong> Github access_token <a href="https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/">Help</a></span>
          </li>
          <li>
            <input type="text" name="repo" id="repo" placeholder="owner/repo" defaultValue={this.config.repo}/>
            <span><strong>Repositories: </strong>(e.g. if your repo is https://github.com/<strong>facebook/create-react-app</strong>, you need to type <strong>facebook/create-react-app</strong>) You can have multiple repos, just separate them with comma (repo,repo)</span>
          </li>
          <li>
            <input type="number" min="1" name="refreshIntervalInMinutes" id="refreshIntervalInMinutes" defaultValue={this.config.refreshIntervalInMinutes}/>
            <span><strong>Refresh rate: </strong> in minutes</span>
          </li>
          <li>
            <input type="number" min="1" name="daysForOldMark" id="daysForOldMark" defaultValue={this.config.daysForOldMark}/>
            <span className="old"><strong>Highlight: </strong>Days for old mark highlight</span>
          </li>
          <li>
            <input type="text" name="team" id="team" placeholder="organisation/my-team" defaultValue={this.config.team}/>
            <span><strong>Team Filter: </strong> If specified, show pull requests created only by members of the team, e.g. <strong>performgroup/my-team-slug</strong> (team members are checked only once per day)</span>
          </li>
          <li>
            <select name="vertical" id="vertical" defaultValue={this.config.vertical}>
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
            <span><strong>Display: </strong> "horizontal" or "vertical" (applies when multiple repositories are set)</span>
          </li>
          <li>
            <select name="emoji" id="emoji" defaultValue={this.config.emoji}>
              <option value="no">no</option>
              <option value="yes">yes</option>
            </select>
            <span><strong>Show emoji: </strong>based on comments number </span>
          </li>
          <li>
            <select name="notifications" id="notifications" defaultValue={this.config.notifications}>
              <option value="no">no</option>
              <option value="yes">yes</option>
            </select>
            <span><strong>Browser notifications </strong> </span>
          </li>
          <li>
            <input type="text" name="notification_icon" id="notification_icon" defaultValue={this.config.notification_icon}/>
            <span><strong>Notification icon: </strong> URL </span>
          </li>
          <li>
            <input type="number" name="font_size" id="font_size" defaultValue={this.config.font_size}/>
            <span><strong>Font size </strong></span>
          </li>
          <li>
            <select name="repo_order" id="repo_order" defaultValue={this.config.repo_order}>
              <option value="default">default</option>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
            <span><strong>Repo order: </strong> if Display is set to "horizontal" order repositories by number of pull requests "asc" = less pull requests on top, "desc" = more pull requests on top</span>
          </li>
          <li><span className="button" onClick={this.saveConfig}>Save Config</span></li>
          </ul>
        </form>
      </div>
    )
  }
  renderReviews(repo, prNumber) {
    const allowedReviewStates = ['APPROVED', 'CHANGES_REQUESTED'];
    const reviews = this.state.prReviews[repo + '_' + prNumber];
    
    if (!reviews || typeof reviews.filter !== 'function') {
      return <img className="reviews-loading" src="https://loading.io/spinners/dual-ring/index.dual-ring-loader.svg" alt="loading"/>;
    }

    let filteredReviews = reviews
      .filter((review) => allowedReviewStates.includes(review.state))
      .map((review) => {
      return (
        <Tooltip key={review.id} className="pull-request-reivew-tooltip" content={review.user.login}>
        <span className={review.state + ' pull-request-review'}>
          <img src={review.user.avatar_url} alt="user review"/>
          <span className="overlay"></span>
        </span>
        </Tooltip>
      )});

    if (filteredReviews.length === 0) {
      return <span className="no-reviews">No reviews yet</span>
    }

    return filteredReviews;
  }
  renderRepo(repoName) {
    const repoPR = this.state.prData[repoName];

    if (!repoPR) {
      return <div key={repoName}><h4 className="repo-heading">{repoName}</h4></div>
    }
    return <div key={repoName} className={repoName}><h4 className="repo-heading">{repoName}</h4>{repoPR.map(pr => this.renderPR(repoName, pr))}</div>

  }
  render() {
    if (!this.state.bootstraped) {
      return (
        <div>
          {this.renderConfig()}
          <p style={{color: '#fff'}}>If loading takes too long, check your app config and network connection</p>
          <img src="https://loading.io/spinners/dual-ring/index.dual-ring-loader.svg" alt="loading"/>
        </div>
      )
    }

    return (
      <div>
        <div className="legend">
          <ul>
            <li className="mergable">is mergable</li>
            <li className="old">older then {this.config.daysForOldMark} days</li>
            {this.config.team ? <li className="teamFilter"><span role="img" aria-label="team"> team 😎:</span> {this.config.team}</li> : ''}
          </ul>
        </div>
        {this.renderConfig()}
        {this.displayError()}
        <div className={'all-repos-wrap ' + (this.config.vertical === 'vertical' ? 'vertical' : 'horizontal')}>
          {this.config.repo.split(',').map(repoName => this.renderRepo(repoName.trim()))}
        </div>
      </div>
    );
  }
}

export default App;
