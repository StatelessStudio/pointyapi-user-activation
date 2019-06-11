# PointyAPI User Activation Module

[Created by Stateless Studio](https://stateless.studio)

## Step 1: Installation

`npm i pointyapi-user-activation`

You'll also need the `Mailer` PointyAPI Module.

## Step 2: Create email templates

Create a Welcome template (in `/assets/html/emails` or wherever you store templates):

`/assets/html/emails/welcome.html`
```html
<table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="width:600px">
	<tbody>
		<tr>
			<td style="text-align:center">
				<h2>{{fname}},</h2>
				<p>Thank you for signing up for {{SITE_TITLE}}! Please click the button to activate your account:</p>
				<br>
				<a class="button-a" href="{{activation_link}}" style="background: #2674fb; border: 15px solid #2674fb; padding: 0 10px;color: #ffffff; font-family: sans-serif; font-size: 13px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 3px; font-weight: bold; max-width: 200px; margin: auto;">Activate Account!</a>
			</td>
		</tr>
	</tbody>
</table>
```

and an Email Updated template:

`/assets/html/emails/user-email-updated.html`
```html
<table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="width:600px">
	<tbody>
		<tr>
			<td style="text-align:center">
				<h2>{{fname}},</h2>
				<p>Someone has tried to update your email. If this was you, please confirm this change:</p>
				<br>
				<a class="button-a" href="{{activation_link}}" style="background: #2674fb; border: 15px solid #2674fb; padding: 0 10px;color: #ffffff; font-family: sans-serif; font-size: 13px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 3px; font-weight: bold; max-width: 200px; margin: auto;">Confirm Email</a>
			</td>
		</tr>
	</tbody>
</table>

```

Add these template files to our sample data module:

`/src/test-data.ts`
```typescript
	await addResource(EmailTemplate, {
		keyname: 'welcome',
		subject: 'Welcome to ' + process.env.SITE_TITLE,
		body: fs.readFileSync('assets/html/emails/welcome.html', {
			encoding: 'utf8'
		})
	});

	await addResource(EmailTemplate, {
		keyname: 'user-email-updated',
		subject: 'Your email address has been updated',
		body: fs.readFileSync('assets/html/emails/user-email-updated.html', {
			encoding: 'utf8'
		})
	});
```

## Step 3: Initialize UserActivationModule

Import the module into your server, and run `init` in the `pointy.before` function.

`/src/server.ts`
```typescript
...
import { mailer } from './Mailer';
import { User } from './models/user';

// Import UserActivationModule
import { UserActivationModule } from 'pointyapi-user-activation';

...

pointy.before = (app) => {
	...
	UserActivationModule.init(mailer, User);
	...
}

...

```

## Step 4: Add tempEmail to your User entity

```typescript
@Entity()
class User extends BaseUser {
	...

	// Email (temporary)
	@Column({ nullable: true, unique: true })
	@Matches(/^[_a-zA-Z0-9\.]+@[0-9a-zA-Z_]+?\.[a-zA-Z]+$/i)
	@IsOptional()
	@OnlySelfCanRead()
	@OnlySelfCanWrite()
	public tempEmail: string = undefined;

	...
}

```

## Step 5: Setup User Hooks

The UserActivationModule will run during User hooks.

Add the following hooks:

`/src/models/user.ts`
```typescript
	...

	/**
	 * beforePost
	 */
	public async beforePost(request: Request, response: Response) {
		// Lowercase username
		if (this.username) {
			this.username = this.username.toLowerCase();
		}

		// Lowercase email
		if (this.email) {
			this.email = this.email.toLowerCase();
		}

		// Run UserActivationModule hook
		const status = await UserActivationModule.beforePost(
			this,
			request,
			response
		).catch((error) => {
			pointy.error(error);
		});

		// Check status
		if (status) {
			// Success
			this.thumbnail = process.env.DEFAULT_THUMBNAIL;

			return super.beforePost(request, response);
		}
		else {
			// Failed
			return false;
		}
	}

	/**
	 * beforeUpdate
	 */
	public async beforePatch(request: Request, response: Response) {
		// Lowercase username
		if (this.username) {
			this.username = this.username.toLowerCase();
		}

		// Lowercase email
		if (this.email) {
			this.email = this.email.toLowerCase();
		}

		// Run UserActivationModule hook
		const status = await UserActivationModule.beforePatch(
			this,
			request,
			response
		).catch((error) => {
			pointy.log(error);
		});

		// Check if email update
		if (status) {
			return super.beforePatch(request, response);
		}
		else {
			return false;
		}
	}


	...
```

## Step 6: Add routes

`/src/routes/user.ts`
```typescript
// Activation routes
router.post('/activate/', UserActivationModule.activationEndpoint);
router.post('/resend-activation/', UserActivationModule.resendEndpoint);
```
