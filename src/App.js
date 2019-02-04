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
      vertical: 'vertical'
    }

    this.state = {
      error: false,
      bootstraped: false,
      reviewsFetchFired: false,
      prData: [],
      prReviews: {},
      mergeable: {}
    }
    this.config = {...defaults, ...options}
    this.handleError = this.handleError.bind(this);
    this.showConfig = this.showConfig.bind(this);
    this.hideConfig = this.hideConfig.bind(this);
    window.handleError = this.handleError
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
    this.config.repo.split(',').forEach((repo) => {
      const repoName = repo.trim();
      fetch(this.getUrl(repoName))
      .then(response => {
        return response.json()
      })
      .then((data) => { 
        if (data.message) {
          this.handleError(data);
        } else {
          this.setState((prevState) => {
            const newData = { repo: repoName, data };
            const prData = [...prevState.prData, newData];
            return { error: false, bootstraped: true, prData, prReviews: {}, reviewsFetchFired: false}
          });
        }
      })
      .catch((error) => {
        this.handleError(error)
      })
    });
  }

  componentDidMount() {
    if (this.config.repo) {
      this.fetchPullRequests();
      window.setInterval(this.fetchPullRequests.bind(this), this.config.refreshIntervalInMinutes*60*1000);
    }
  }

  componentDidUpdate() {
    // Fetch aditional reviews data only when there hasn't been fired request for it already
    if (!this.state.reviewsFetchFired && this.state.prData.length > 0) {
      this.state.prData.forEach((singlePr) => {
        singlePr.data.forEach((pr) => {
          fetch(this.getUrl(undefined, 'reviews', pr.url))
          .then(response => response.json())
          .then((data) => {
            if (data.message) {
              this.handleError(data);
            } else {
              const reviews = {
                ...this.state.prReviews,
                [singlePr.repo + '_' + pr.number]: data
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
                mergeable[singlePr.repo + '_' + pr.number] = {}
                mergeable[singlePr.repo + '_' + pr.number].mergeable = data.mergeable
                mergeable[singlePr.repo + '_' + pr.number].mergeable_state = data.mergeable_state

                return { mergeable }
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
    console.log(error);
    this.setState({error: true, bootstraped: true})
  }

  displayError() {
    return this.state.error
    ? <div className="error">Error occured. Possible issue: API limit rate exceeded or service down or access_token not permitted or repo not found. If you reach API limit, it is good to raise the refresh rate internval to higher number. Check console/network.</div>
    : ''
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

    const mergeable = this.state.mergeable[pr.number]
      && this.state.mergeable[repo + '_' + pr.number].mergeable 
      && this.state.mergeable[repo + '_' + pr.number].mergeable_state === 'clean' ? ' mergeable' : '';

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
              <a href={`https://github.com/${this.config.repo}/pull/${pr.number}`} rel="noopener noreferrer" target="_blank">{pr.number}</a>
            </span> 
            <span>Updated: <span className="pull-request-ago">{distanceInWords(new Date(), new Date(pr.updated_at))}</span> ago.</span>
          </div>
          <div>
            {this.renderReviews(repo, pr.number)}
          </div>
          </div>
      </div>
    )
  }
  saveConfig() {
    const configElems = document.querySelectorAll('input')
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
            <input type="text" name="access_token" id="access_token" defaultValue={this.config.access_token}/>
            <span>github access_token <a href="https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/">Help</a></span>
          </li>
          <li>
            <input type="text" name="repo" id="repo" defaultValue={this.config.repo}/>
            <span>repositories name [for multiple use "," as delimeter] (e.g. "facebook/create-react-app" https://github.com/<strong>facebook/create-react-app</strong>)</span>
          </li>
          <li>
            <input type="number" min="1" name="refreshIntervalInMinutes" id="refreshIntervalInMinutes" defaultValue={this.config.refreshIntervalInMinutes}/>
            <span>refresh rate in minutes</span>
          </li>
          <li>
            <input type="number" min="1" name="daysForOldMark" id="daysForOldMark" defaultValue={this.config.daysForOldMark}/>
            <span className="old">Days for old mark highlight</span>
          </li>
          <li>
            <input type="text" name="vertical" id="vertical" defaultValue={this.config.vertical}/>
            <span>Display of multiple repos horizontal/vertical</span>
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
      return <span className="no-reviews">No reivews yet</span>
    }

    return filteredReviews;
  }
  renderRepo(repoName) {
    const repoPR = this.state.prData.find((repo) => repo.repo === repoName);
    if (!repoPR) {
      return <div key={repoName}></div>
    }
    return <div key={repoPR.repo} className={repoPR.repo}><h4 className="repo-heading">{repoPR.repo}</h4>{repoPR.data.map(pr => this.renderPR(repoPR.repo, pr))}</div>

  }
  render() {
    if (!this.state.bootstraped) {
      return (
        <div>
          {this.renderConfig()}
          <p>If loading takes too long, check your app config and network connection</p>
          <img src="https://loading.io/spinners/dual-ring/index.dual-ring-loader.svg" alt="loading"/>
        </div>
      )
    }

    return (
      <div>
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
