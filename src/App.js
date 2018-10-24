import React, { Component } from 'react';
import './App.css';
import distanceInWords from 'date-fns/distance_in_words';
import differenceInDays from 'date-fns/difference_in_days';
import differenceInHours from 'date-fns/difference_in_hours';


class App extends Component {
  constructor() {
    super();
    this.state = {
      error: false,
      bootstraped: false,
      reviewsFetchFired: false,
      prData: [],
      prReviews: {},
      mergeable: {}
    }
    this.handleError = this.handleError.bind(this);
    window.handleError = this.handleError
  }

  fetchPullRequests() {
    /*
    ** https://developer.github.com/v3/pulls/
    ** GET /repos/:owner/:repo/pulls
    ** ?access_token=:acces_token
    */
   fetch('https://api.github.com/repos/performgroup/ow-opta-widgets-v3/pulls?access_token=3ff4a0c765fa261f231240ebd118fc580906fbe0')
   .then(response => {
      return response.json()
    })
    .then((data) => { 
      if (data.message) {
        this.handleError(data);
      } else {
        this.setState( { error: false, bootstraped: true, prData: data, prReviews: {}, reviewsFetchFired: false})
      }
    })
    .catch((error) => {
      this.handleError(error)
    })
  }

  componentDidMount() {
   this.fetchPullRequests();
   window.setInterval(this.fetchPullRequests.bind(this), 60*1000);
  }

  componentDidUpdate() {
    // Fetch aditional reviews data only when there hasn't been fired request for it already
    if (!this.state.reviewsFetchFired && this.state.prData.length > 0) {
      this.state.prData.forEach((pr) => {
        /*
        ** https://developer.github.com/v3/pulls/reviews/
        ** GET /repos/:owner/:repo/pulls/:number/reviews
        */
        fetch(`https://api.github.com/repos/performgroup/ow-opta-widgets-v3/pulls/${pr.number}/reviews?access_token=3ff4a0c765fa261f231240ebd118fc580906fbe0`)
          .then(response => response.json())
          .then((data) => {
            if (data.message) {
              this.handleError(data);
            } else {
              const reviews = {
                ...this.state.prReviews,
                [pr.number]: data
              }
              this.setState( {prReviews: reviews} );
            }
          })
          .catch((error) => this.handleError(error))

          fetch(`https://api.github.com/repos/performgroup/ow-opta-widgets-v3/pulls/${pr.number}?access_token=3ff4a0c765fa261f231240ebd118fc580906fbe0`)
          .then(response => response.json())
          .then((data) => {
            if (data.message) {
              this.handleError(data);
            } else {
              this.setState((state) => {
                let mergeable = {...state.mergeable}
                mergeable[pr.number] = {}
                mergeable[pr.number].mergeable = data.mergeable
                mergeable[pr.number].mergeable_state = data.mergeable_state

                return { mergeable }
              })
            }
          })
          .catch((error) => this.handleError(error))
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
    ? <div className="error">Error occured. Either API limit rate exceeded or service down. Check console.</div>
    : ''
  }
  renderPR(pr) {
    const decideNewOldClass = function (pr) {
      const maxHours = 12 // new if less than 12 hours
      const maxDays = 3 // old if more than 7 days
      let oldnewClass = '';
      if (differenceInHours(new Date(),new Date(pr.created_at)) < maxHours) {
        oldnewClass = 'new';
      } else if(differenceInDays(new Date(),new Date(pr.updated_at)) >= maxDays) {
        oldnewClass = 'old';
      }

      return oldnewClass;
    }

    const mergeable = this.state.mergeable[pr.number]
      && this.state.mergeable[pr.number].mergeable 
      && this.state.mergeable[pr.number].mergeable_state === 'clean' ? ' mergeable' : '';

    return (
      <div key={pr.number} className={`pull-request-wrap ${decideNewOldClass(pr)}  ${mergeable}`}>
        <div className="pull-request-title">
        <span className="pull-request-user"><img src={pr.user.avatar_url} alt="user"/></span>
        <span className="pull-request-state">{pr.state}</span>
        {pr.title}
        </div>
        <div className="pull-request-meta">
          <div>
            <span className="pull-request-number">{pr.number}</span> 
            <span>Updated: <span className="pull-request-ago">{distanceInWords(new Date(), new Date(pr.updated_at))}</span> ago.</span>
          </div>
          <div>
            {this.renderReviews(pr.number)}
          </div>
          </div>
      </div>
    )
  }

  renderReviews(prNumber) {
    const allowedReviewStates = ['APPROVED', 'CHANGES_REQUESTED'];
    const reviews = this.state.prReviews[prNumber];
    
    if (!reviews || typeof reviews.filter !== 'function') {
      return <img className="reviews-loading" src="https://loading.io/spinners/dual-ring/index.dual-ring-loader.svg" alt="loading"/>;
    }

    let filteredReviews = reviews
      .filter((review) => allowedReviewStates.includes(review.state))
      .map((review) => <span key={review.id} className={review.state + ' pull-request-review'}><img src={review.user.avatar_url} alt="user review"/><span className="overlay"></span></span>)

    if (filteredReviews.length === 0) {
      return <span className="no-reviews">No reivews yet</span>
    }

    return filteredReviews;
  }

  render() {
    if (!this.state.bootstraped) {
      return <img src="https://loading.io/spinners/dual-ring/index.dual-ring-loader.svg" alt="loading"/>
    }

    return (
      <div>
        {this.displayError()}
        {this.state.prData.map(pr => this.renderPR(pr))}
      </div>
    );
  }
}

export default App;
