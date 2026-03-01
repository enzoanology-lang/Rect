from flask import Flask, render_template, jsonify, request, session
from flask_cors import CORS
import requests
import json
import os
from datetime import datetime, timedelta
import hashlib
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
CORS(app)

# Configuration
API_BASE_URL = "https://rpwlikers.ratbu.xyz/api"
TURNSTILE_SITEKEY = "0x4AAAAAACUsa-zJ8337KSJA"

# In-memory storage (replace with database in production)
users = {}
user_sessions = {}

class User:
    def __init__(self, uid, name, email, profile_pic=None):
        self.uid = uid
        self.name = name
        self.email = email
        self.profile_pic = profile_pic
        self.uses_used = 0
        self.uses_max = 10
        self.last_used = None
        self.created_at = datetime.now()
    
    def to_dict(self):
        return {
            'uid': self.uid,
            'name': self.name,
            'email': self.email,
            'profile_pic': self.profile_pic,
            'uses_used': self.uses_used,
            'uses_max': self.uses_max,
            'last_used': self.last_used.isoformat() if self.last_used else None,
            'created_at': self.created_at.isoformat()
        }

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html', turnstile_sitekey=TURNSTILE_SITEKEY)

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        
        if 'email' in data and 'password' in data:
            # Email/Password login
            email = data['email']
            password = data['password']
            
            # Forward to external API
            response = requests.post(
                f"{API_BASE_URL}/login",
                json={'email': email, 'password': password},
                timeout=30
            )
            
            if response.status_code == 200:
                api_data = response.json()
                
                if api_data.get('success'):
                    # Create or update user
                    user_data = api_data['user']
                    uid = user_data.get('uid', hashlib.md5(email.encode()).hexdigest()[:8])
                    
                    user = User(
                        uid=uid,
                        name=user_data.get('name', email.split('@')[0]),
                        email=email,
                        profile_pic=user_data.get('profile_pictures', {}).get('v2')
                    )
                    
                    # Update usage from API
                    user.uses_used = user_data.get('uses_used', 0)
                    user.uses_max = user_data.get('uses_max', 10)
                    
                    users[uid] = user
                    
                    # Create session
                    session_token = secrets.token_hex(32)
                    user_sessions[session_token] = uid
                    
                    return jsonify({
                        'success': True,
                        'user': user.to_dict(),
                        'cookie': api_data.get('cookie'),
                        'session_token': session_token
                    })
            
            return jsonify({
                'success': False,
                'error': 'Invalid email or password'
            }), 401
            
        elif 'cookie' in data:
            # Cookie login
            cookie = data['cookie']
            
            response = requests.post(
                f"{API_BASE_URL}/login",
                json={'cookie': cookie},
                timeout=30
            )
            
            if response.status_code == 200:
                api_data = response.json()
                
                if api_data.get('success'):
                    user_data = api_data['user']
                    uid = user_data.get('uid', hashlib.md5(cookie.encode()).hexdigest()[:8])
                    
                    user = User(
                        uid=uid,
                        name=user_data.get('name', 'User'),
                        email=user_data.get('email', ''),
                        profile_pic=user_data.get('profile_pictures', {}).get('v2')
                    )
                    
                    user.uses_used = user_data.get('uses_used', 0)
                    user.uses_max = user_data.get('uses_max', 10)
                    
                    users[uid] = user
                    
                    session_token = secrets.token_hex(32)
                    user_sessions[session_token] = uid
                    
                    return jsonify({
                        'success': True,
                        'user': user.to_dict(),
                        'cookie': cookie,
                        'session_token': session_token
                    })
            
            return jsonify({
                'success': False,
                'error': 'Invalid cookie'
            }), 401
        
        return jsonify({
            'success': False,
            'error': 'Invalid login method'
        }), 400
        
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Login request timed out. Please try again.'
        }), 504
    except requests.exceptions.ConnectionError:
        return jsonify({
            'success': False,
            'error': 'Cannot connect to authentication server. Please check your internet connection.'
        }), 503
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Login failed: {str(e)}'
        }), 500

@app.route('/api/user-status/<uid>')
def user_status(uid):
    """Get user status and usage information"""
    try:
        user = users.get(uid)
        
        if not user:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        now = datetime.now()
        
        # Reset daily usage if needed
        if user.last_used:
            if (now - user.last_used) > timedelta(days=1):
                user.uses_used = 0
                user.last_used = None
        
        return jsonify({
            'success': True,
            'data': {
                'uses_used': user.uses_used,
                'uses_max': user.uses_max,
                'date': now.timestamp() * 1000,
                'uses_cd': 15  # 15 minutes cooldown
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/boost', methods=['POST'])
def boost():
    """Handle reaction boosting"""
    try:
        data = request.get_json()
        cookie = data.get('cookie')
        link = data.get('link')
        reaction = data.get('reaction')
        turnstileToken = data.get('turnstileToken')
        
        if not all([cookie, link, reaction, turnstileToken]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Forward to external API
        response = requests.post(
            f"{API_BASE_URL}/boost",
            json={
                'cookie': cookie,
                'link': link,
                'reaction': reaction,
                'turnstileToken': turnstileToken
            },
            timeout=60
        )
        
        if response.status_code == 200:
            api_data = response.json()
            
            # Update user usage
            for user in users.values():
                if user.cookie == cookie:  # Note: In production, don't store cookies like this
                    now = datetime.now()
                    
                    if user.last_used:
                        cooldown = timedelta(minutes=15)
                        if (now - user.last_used) < cooldown:
                            remaining = cooldown - (now - user.last_used)
                            return jsonify({
                                'success': False,
                                'status': 'cooldown',
                                'error': f'Please wait {remaining.seconds // 60} minutes before next reaction',
                                'cd': {'m': remaining.seconds // 60}
                            })
                    
                    user.uses_used += 1
                    user.last_used = now
                    
                    if user.uses_used >= user.uses_max:
                        next_reset = now + timedelta(days=1)
                        remaining = next_reset - now
                        
                        return jsonify({
                            'success': False,
                            'status': 'limit',
                            'error': 'Daily limit reached',
                            'cd': {
                                'h': remaining.seconds // 3600,
                                'm': (remaining.seconds % 3600) // 60
                            }
                        })
                    
                    break
            
            return jsonify({
                'success': True,
                'message': api_data.get('message', 'Reactions sent successfully!')
            })
        
        return jsonify({
            'success': False,
            'error': 'Failed to send reactions'
        }), response.status_code
        
    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Request timed out. The API is taking longer than expected.'
        }), 504
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    try:
        session_token = request.headers.get('X-Session-Token')
        
        if session_token and session_token in user_sessions:
            del user_sessions[session_token]
        
        return jsonify({
            'success': True,
            'message': 'Logged out successfully'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
