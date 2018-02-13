import {remote, ipcRenderer as ipc} from 'electron';
import {is} from 'electron-util';
import React from 'react';
import Api from '../api';
import Progress from '../components/Progress';
import LoginBox from './LoginBox';
import Welcome from './Welcome';
import ForgotPassword from './ForgotPassword';
import './Login.scss';

const {getPortfolios, decryptSeedPhrase} = remote.require('./portfolio-util');

const initMarketmaker = seedPhrase => new Promise(resolve => {
	ipc.send('start-marketmaker', {seedPhrase});

	ipc.on('marketmaker-started', async (event, port) => {
		resolve(`http://127.0.0.1:${port}`);
	});
});

const initApi = async seedPhrase => {
	const config = remote.require('./config');

	let url = config.get('marketmakerUrl');
	if (url) {
		console.log('Using custom marketmaker URL:', url);
	} else {
		url = await initMarketmaker(seedPhrase);
	}

	return new Api({
		endpoint: url,
		seedPhrase,
	});
};

export default class Login extends React.Component {
	state = {
		portfolios: null,
		selectedPortfolioId: remote.require('./config').get('lastActivePortfolioId'),
		activeView: 'LoginBox',
		progress: 0,
	};

	setLoginState = state => {
		if (is.development) {
			console.log('Login state:', state);
		}

		this.setState(state);
	}

	loadPortfolios = async () => {
		this.setState({
			portfolios: await getPortfolios(),
		});
	}

	handleLogin = async (portfolio, password) => {
		// TODO: Show some loading here as it takes some time to decrypt the password and then start marketmaker
		const seedPhrase = await decryptSeedPhrase(portfolio.encryptedSeedPhrase, password);
		const api = await initApi(seedPhrase);

		if (is.development) {
			// Expose the API for debugging in DevTools
			// Example: `api.debug({method: 'portfolio'})`
			window.api = api;
		}

		// TODO: These should be defaults saved in the config and changeable by the user
		await Promise.all([
			api.enableCoin('KMD'),
			api.enableCoin('VTC'),
			api.enableCoin('LTC'),
		]);

		const {portfolio: currencies} = await api.portfolio();

		remote.require('./config').set('lastActivePortfolioId', portfolio.id);

		this.props.setAppState({
			activeView: 'Dashboard',
			portfolio,
			currencies,
			api,
		});
	};

	constructor(props) {
		super(props);

		this.loadPortfolios();
	}

	renderSubview() {
		const {portfolios} = this.state;

		if (this.state.activeView === 'LoginBox') {
			return (
				<LoginBox
					{...this.props}
					portfolios={portfolios}
					loadPortfolios={this.loadPortfolios}
					handleLogin={this.handleLogin}
					loginState={this.state}
					setLoginState={this.setLoginState}
				/>
			);
		}

		if (this.state.activeView.startsWith('ForgotPassword')) {
			return (
				<ForgotPassword
					{...this.props}
					portfolios={portfolios}
					loadPortfolios={this.loadPortfolios}
					loginState={this.state}
					setLoginState={this.setLoginState}
				/>
			);
		}
	}

	render() {
		const {portfolios} = this.state;

		if (portfolios === null) {
			return null; // Not loaded yet
		}

		if (portfolios.length === 0) {
			return <Welcome {...this.props}/>;
		}

		return (
			<div className="Login container">
				<Progress className="login-progress" value={this.state.progress}/>
				<div className="is-centered">
					<img className="hyperdex-icon" src="/assets/hyperdex-icon.svg" width="75" height="75"/>
					{this.renderSubview()}
				</div>
			</div>
		);
	}
}
