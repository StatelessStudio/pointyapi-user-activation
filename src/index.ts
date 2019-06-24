import { getRepository } from 'typeorm';
import { UserStatus } from 'pointyapi/enums';

// Token
import { jwtBearer, pointy } from 'pointyapi';

/**
 * User Activation Module
 */
export class PointyUserActivation {
	// Linkback url
	public clientUrl: string = process.env.CLIENT_URL;

	// PointyAPI Mailer module
	public mailer;
	public welcomeTemplate = 'welcome';
	public emailUpdateTemplate = 'user-email-updated';

	// PointyAPI User Type
	public userType;

	// PointyAPI JwtBearer module
	public jwtBearer = jwtBearer;

	/**
	 * Constructor
	 */
	constructor() {
		this.resendEndpoint = this.resendEndpoint.bind(this);
		this.activationEndpoint = this.activationEndpoint.bind(this);
	}

	/**
	 * Initialize
	 * @param mailer Instance of PointyAPI Mailer module
	 * @param userType User type
	 * @param jwt (Optional) Custom jwtBearer instances
	 */
	public init(mailer, userType, jwt?) {
		this.mailer = mailer;
		this.userType = userType;

		if (jwt) {
			this.jwtBearer = jwt;
		}
	}

	/**
	 * Log
	 * @param data Data to log
	 */
	public log(...data) {
		console.log(data);
	}

	/**
	 * Create activation link
	 * @param user User to create link for
	 * @return String
	 */
	public createLink(user) {
		// Generate activation token
		const activateToken = this.jwtBearer.sign(user, false, {
			isActivate: true
		});

		return `${this.clientUrl}/activate?id=${activateToken}`;
	}

	/**
	 * User beforePost hook
	 * @param user User object (pass `this` from your hook)
	 * @param request Request object
	 * @param response Response object
	 * @return Async boolean
	 */
	public async beforePost(user, request, response) {
		// Set tempEmail
		user.tempEmail = user.email;
		delete user.email;

		// Check for email conflicts
		const conflict = await getRepository(this.userType)
			.findOne({
				where: [
					{ email: user.tempEmail },
					{ tempEmail: user.tempEmail }
				]
			})
			.catch((error) => response.error('Could not load users'));

		if (conflict) {
			// Conflict
			response.conflictResponder('Email is registered');

			return false;
		}
		else {
			return true;
		}
	}

	/**
	 * User afterPost hook
	 * @param user User object (pass `this` from your hook)
	 * @param request Request object
	 * @param response Response object
	 * @return Async boolean
	 */
	public async afterPost(user, request, response) {
		// Send activation email
		return await this.send(user, request, response).catch((error) =>
			pointy.log(error)
		);
	}

	/**
	 * User beforePatch hook
	 * @param user User object (pass `this` from your hook)
	 * @param request Request object
	 * @param response Response object
	 * @return Async boolean
	 */
	public async beforePatch(user, request, response) {
		if (
			user.email &&
			user.email !== request.payload['email'] &&
			user.email !== request.payload['tempEmail']
		) {
			return this.beforePost(user, request, response);
		}
		else {
			return true;
		}
	}

	/**
	 * Send (or resend) activation link
	 * @param request Request object
	 * @param response Response object
	 * @return Async boolean
	 */
	public async send(user, request, response) {
		// Get appropriate template
		const templateKey =
			request.method.toLowerCase() === 'post'
				? this.welcomeTemplate
				: this.emailUpdateTemplate;

		// Get template
		const template = this.mailer.getTemplate(templateKey);

		// Check template
		if (template) {
			// Copy user
			const userobj = Object.assign({}, user);
			userobj.activation_link = this.createLink(user);

			// Send email
			return await this.mailer
				.sendFromTemplate(
					userobj.tempEmail || userobj.email,
					template,
					userobj
				)
				.then(() => true)
				.catch(() => {
					response.error('Could not send');
					this.log('Could not send email');

					return false;
				});
		}
		else {
			response.error('Could not send');
			this.log('Could not load template');

			return false;
		}
	}

	/**
	 * Resend activation endpoint
	 */
	public async resendEndpoint(request, response, next) {
		const result = await this.send(request.user, request, response);

		if (result) {
			response.sendStatus(204);
		}
	}

	/**
	 * Confirm activation endpoint
	 */
	public async activationEndpoint(request, response, next) {
		// Check if body exists & contains an activation token
		if (request.body && 'activate' in request.body) {
			const activate = request.body.activate;

			// Check if it is valid
			if (activate && typeof activate === 'string') {
				// Decode key
				const decoded = this.jwtBearer.dryVerify(activate);

				// Check token
				if (
					!decoded ||
					!('id' in decoded) ||
					!('isActivate' in decoded) ||
					!decoded.isActivate
				) {
					response.validationResponder('Invalid token');
					return false;
				}

				// Get user
				const user: any = await getRepository(this.userType)
					.findOne({ id: decoded.id })
					.catch((error) => response.error('Could not load user'));

				// Check token
				if (user) {
					// Update user's status
					user.status = UserStatus.Active;

					// Update user's email
					user.email = user.tempEmail;
					user.tempEmail = null;

					// Delete activate from user
					user.activateToken = null;

					// Add to mailing list
					await this.mailer
						.listAdd(user.email, user.fname, {})
						.catch((error) => {
							this.log(
								`Could not add email to list: ${user.email}`,
								error
							);
						});

					// Save user
					await getRepository(this.userType)
						.save(user)
						.catch((error) =>
							response.error('Could not update user')
						);

					// Respond w/ success
					response.sendStatus(204);
					return true;
				}
				else {
					// Fail
					response.validationResponder('Activation code expired');
				}
			}
			else {
				// Bad request
				response.validationResponder('Invalid activation code');
			}
		}
		else {
			// Bad request
			response.validationResponder('Please supply activation code');
		}
	}
}

export const UserActivationModule = new PointyUserActivation();
