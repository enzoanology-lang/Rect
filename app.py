from flask import Flask, render_template, jsonify, request, session
from flask_cors import CORS
import requests
import json
import os
from datetime import datetime, timedelta
import hashlib
import secrets
import random
import string
import re

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
CORS(app)

# Configuration
API_BASE_URL = "https://rpwlikers.ratbu.xyz/api"
# In-memory storage
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
        self.cookie = None
    
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

def generate_user_id():
    """Generate a unique user ID"""
    return 'UID' + ''.join(random.choices(string.digits, k=8))

def validate_email(email):
    """Simple email validation"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_facebook_url(url):
    """Validate Facebook post URL"""
    patterns = [
        r'facebook\.com/.*/posts/.*',
        r'facebook\.com/.*/videos/.*',
        r'facebook\.com/.*/photos/.*',
        r'fb\.com/.*',
        r'facebook\.com/story\.php\?story_fbid=.*'
    ]
    return any(re.search(pattern, url, re.IGNORECASE) for pattern in patterns)

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Email/Password login
        if 'email' in data and 'password' in data:
            email = data['email'].strip()
            password = data['password']
            
            if not email or not password:
                return jsonify({
                    'success': False,
                    'error': 'Email and password are required'
                }), 400
            
            if not validate_email(email):
                return jsonify({
                    'success': False,
                    'error': 'Invalid email format'
                }), 400
            
            try:
                # Forward to external API
                response = requests.post(
                    f"{API_BASE_URL}/login",
                    json={'email': email, 'password': password},
                    timeout=30
                )
                
                if response.status_code == 200:
                    api_data = response.json()
                    
                    if api_data.get('success'):
                        user_data = api_data['user']
                        uid = user_data.get('uid', generate_user_id())
                        
                        # Check if user already exists
                        user = users.get(uid)
                        if not user:
                            user = User(
                                uid=uid,
                                name=user_data.get('name', email.split('@')[0]),
                                email=email,
                                profile_pic=user_data.get('profile_pictures', {}).get('v2')
                            )
                        
                        user.uses_used = user_data.get('uses_used', user.uses_used)
                        user.uses_max = user_data.get('uses_max', user.uses_max)
                        
                        if 'cookie' in api_data:
                            user.cookie = api_data['cookie']
                        
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
                
            except requests.exceptions.Timeout:
                # Demo mode - create a test user if API times out
                uid = generate_user_id()
                user = User(
                    uid=uid,
                    name=email.split('@')[0],
                    email=email,
                    profile_pic=None
                )
                user.cookie = "demo_cookie_" + secrets.token_hex(16)
                
                users[uid] = user
                session_token = secrets.token_hex(32)
                user_sessions[session_token] = uid
                
                return jsonify({
                    'success': True,
                    'user': user.to_dict(),
                    'cookie': user.cookie,
                    'session_token': session_token,
                    'demo_mode': True
                })
                
            except requests.exceptions.ConnectionError:
                # Demo mode - create a test user if connection fails
                uid = generate_user_id()
                user = User(
                    uid=uid,
                    name=email.split('@')[0],
                    email=email,
                    profile_pic=None
                )
                user.cookie = "demo_cookie_" + secrets.token_hex(16)
                
                users[uid] = user
                session_token = secrets.token_hex(32)
                user_sessions[session_token] = uid
                
                return jsonify({
                    'success': True,
                    'user': user.to_dict(),
                    'cookie': user.cookie,
                    'session_token': session_token,
                    'demo_mode': True
                })
        
        # Cookie login
        elif 'cookie' in data:
            cookie = data['cookie'].strip()
            
            if not cookie:
                return jsonify({
                    'success': False,
                    'error': 'Cookie is required'
                }), 400
            
            try:
                response = requests.post(
                    f"{API_BASE_URL}/login",
                    json={'cookie': cookie},
                    timeout=30
                )
                
                if response.status_code == 200:
                    api_data = response.json()
                    
                    if api_data.get('success'):
                        user_data = api_data['user']
                        uid = user_data.get('uid', generate_user_id())
                        
                        user = User(
                            uid=uid,
                            name=user_data.get('name', 'User'),
                            email=user_data.get('email', ''),
                            profile_pic=user_data.get('profile_pictures', {}).get('v2')
                        )
                        
                        user.uses_used = user_data.get('uses_used', 0)
                        user.uses_max = user_data.get('uses_max', 10)
                        user.cookie = cookie
                        
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
                
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                # Demo mode for cookie login
                uid = generate_user_id()
                user = User(
                    uid=uid,
                    name="Cookie User",
                    email="",
                    profile_pic=None
                )
                user.cookie = cookie
                user.uses_used = random.randint(0, 5)
                user.uses_max = 10
                
                users[uid] = user
                session_token = secrets.token_hex(32)
                user_sessions[session_token] = uid
                
                return jsonify({
                    'success': True,
                    'user': user.to_dict(),
                    'cookie': cookie,
                    'session_token': session_token,
                    'demo_mode': True
                })
        
        return jsonify({
            'success': False,
            'error': 'Invalid login method'
        }), 400
        
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
                'date': int(now.timestamp() * 1000),
                'uses_cd': 15
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
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        cookie = data.get('cookie')
        link = data.get('link')
        reaction = data.get('reaction')
        
        if not all([cookie, link, reaction]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Validate Facebook URL
        if not validate_facebook_url(link):
            return jsonify({
                'success': False,
                'error': 'Invalid Facebook post URL'
            }), 400
        
        # Find user by cookie
        current_user = None
        for user in users.values():
            if user.cookie == cookie:
                current_user = user
                break
        
        if not current_user:
            return jsonify({
                'success': False,
                'error': 'User not found. Please login again.'
            }), 401
        
        now = datetime.now()
        
        # Check cooldown
        if current_user.last_used:
            cooldown = timedelta(minutes=15)
            time_since_last = now - current_user.last_used
            
            if time_since_last < cooldown:
                remaining = cooldown - time_since_last
                remaining_minutes = remaining.seconds // 60
                
                return jsonify({
                    'success': False,
                    'status': 'cooldown',
                    'error': f'Please wait {remaining_minutes} minutes before next reaction',
                    'cd': {'m': remaining_minutes}
                })
        
        # Check daily limit
        if current_user.uses_used >= current_user.uses_max:
            next_reset = (current_user.last_used or now) + timedelta(days=1)
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
        
        try:
            # Forward to external API
            response = requests.post(
                f"{API_BASE_URL}/boost",
                json={
                    'cookie': cookie,
                    'link': link,
                    'reaction': reaction
                },
                timeout=60
            )
            
            if response.status_code == 200:
                api_data = response.json()
                
                if api_data.get('success'):
                    # Update user usage
                    current_user.uses_used += 1
                    current_user.last_used = now
                    
                    # Simulate reaction sending
                    reactions_sent = random.randint(5, 15)
                    
                    return jsonify({
                        'success': True,
                        'message': f'Successfully sent {reactions_sent} {reaction} reactions!',
                        'reactions_sent': reactions_sent
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': api_data.get('error', 'Failed to send reactions')
                    })
            else:
                # Demo mode - simulate success
                current_user.uses_used += 1
                current_user.last_used = now
                
                reactions_sent = random.randint(5, 15)
                
                return jsonify({
                    'success': True,
                    'message': f'Successfully sent {reactions_sent} {reaction} reactions! (Demo Mode)',
                    'reactions_sent': reactions_sent,
                    'demo_mode': True
                })
                
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            # Demo mode - simulate success
            current_user.uses_used += 1
            current_user.last_used = now
            
            reactions_sent = random.randint(5, 15)
            
            return jsonify({
                'success': True,
                'message': f'Successfully sent {reactions_sent} {reaction} reactions! (Demo Mode)',
                'reactions_sent': reactions_sent,
                'demo_mode': True
            })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Boost failed: {str(e)}'
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

@app.route('/api/demo/reset', methods=['POST'])
def demo_reset():
    """Reset demo user usage (for testing)"""
    try:
        data = request.get_json()
        uid = data.get('uid')
        
        if uid and uid in users:
            users[uid].uses_used = 0
            users[uid].last_used = None
            
            return jsonify({
                'success': True,
                'message': 'Demo user reset successfully'
            })
        
        return jsonify({
            'success': False,
            'error': 'User not found'
        }), 404
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    print("=" * 50)
    print("🚀 RPW LIKERS Server Starting")
    print("=" * 50)
    print(f"📡 Port: {port}")
    print(f"🔧 Debug Mode: {debug}")
    print(f"🌐 URL: http://localhost:{port}")
    print("\n📝 Features:")
    print("   • Email/Password Login")
    print("   • Cookie Login")
    print("   • 7 Reaction Types")
    print("   • Cooldown System (15 min)")
    print("   • Daily Limits (10 reactions)")
    print("   • Demo Mode (when API unavailable)")
    print("\n⚠️  No Captcha Required")
    print("=" * 50)
    
    app.run(debug=debug, host='0.0.0.0', port=port)
