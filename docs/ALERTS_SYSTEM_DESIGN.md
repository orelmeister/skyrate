# 🔔 SkyRate AI - Monitoring & Alerts System Design

> Comprehensive real-time monitoring and notification system for E-Rate status changes, Form 470 opportunities, and custom watch lists.

---

## 📋 Executive Summary

The Alerts System enables SkyRate AI users to receive **proactive notifications** about changes to their watched entities—schools, FRNs, Form 470s, and competitors—without manually checking dashboards.

### Key Goals
1. **Never miss a Form 470 deadline** - Vendors get instant alerts for new leads
2. **Track FRN status changes in real-time** - Know immediately when funding is approved or denied
3. **Monitor competitor activity** - Stay ahead of market movements
4. **Reduce manual USAC checking** - Automated polling replaces manual research

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SkyRate AI Alerts System                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐     │
│  │ USAC Open   │───▶│ Polling      │───▶│ Change Detection    │     │
│  │ Data APIs   │    │ Service      │    │ Engine              │     │
│  └─────────────┘    │ (15-min)     │    └─────────┬───────────┘     │
│                     └──────────────┘              │                  │
│                                                   ▼                  │
│                     ┌──────────────┐    ┌─────────────────────┐     │
│                     │ User Watch   │◀───│ Alert Generation    │     │
│                     │ Configurations│    │ Service             │     │
│                     └──────────────┘    └─────────┬───────────┘     │
│                                                   │                  │
│         ┌────────────────────────────────────────┼───────────┐      │
│         │                                        │           │      │
│         ▼                  ▼                     ▼           ▼      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ ┌──────────┐  │
│  │ Email       │  │ Web Push     │  │ In-App       │ │ Digest   │  │
│  │ Notifications│  │ Notifications│  │ Notifications│ │ Reports  │  │
│  └─────────────┘  └──────────────┘  └──────────────┘ └──────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Models

### 1. AlertConfiguration
Defines what entities a user is watching.

```python
class AlertConfiguration(Base):
    """User's alert preferences for watched entities"""
    __tablename__ = "alert_configurations"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # What to watch
    entity_type = Column(Enum(
        "school",           # Watch a specific school (by BEN)
        "frn",              # Watch specific FRN
        "spin",             # Watch competitor SPIN
        "form470",          # Watch Form 470 (by ID)
        "manufacturer",     # Watch Form 470s mentioning manufacturer
        "state",            # Watch all Form 470s in state
        "denial_reason"     # Watch for specific denial codes
    ), nullable=False)
    
    entity_id = Column(String(100), nullable=False)  # BEN, FRN, SPIN, etc.
    entity_name = Column(String(255))  # Human-readable name
    
    # What triggers alerts
    alert_triggers = Column(JSON)  # List of trigger types
    # Examples: ["status_change", "new_posting", "deadline_approaching"]
    
    # How to notify
    notify_email = Column(Boolean, default=True)
    notify_push = Column(Boolean, default=True)
    notify_in_app = Column(Boolean, default=True)
    
    # Alert frequency
    frequency = Column(Enum("instant", "hourly", "daily", "weekly"), default="instant")
    
    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="alert_configs")
```

### 2. Alert
Individual alert instances.

```python
class Alert(Base):
    """Individual alert instances"""
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    config_id = Column(Integer, ForeignKey("alert_configurations.id"))
    
    # Alert details
    alert_type = Column(Enum(
        "frn_status_change",
        "new_form470",
        "form470_deadline",
        "school_denial",
        "competitor_win",
        "budget_update",
        "appeal_decision"
    ), nullable=False)
    
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    
    # Related entity
    entity_type = Column(String(50))
    entity_id = Column(String(100))
    entity_url = Column(String(500))  # Deep link to relevant page
    
    # Metadata
    severity = Column(Enum("info", "warning", "urgent"), default="info")
    data = Column(JSON)  # Additional context
    
    # Status
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    is_dismissed = Column(Boolean, default=False)
    
    # Delivery tracking
    email_sent = Column(Boolean, default=False)
    email_sent_at = Column(DateTime)
    push_sent = Column(Boolean, default=False)
    push_sent_at = Column(DateTime)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="alerts")
    config = relationship("AlertConfiguration")
```

### 3. AlertHistory
Tracking for digest reports.

```python
class AlertHistory(Base):
    """Historical tracking for analytics and digests"""
    __tablename__ = "alert_history"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Digest period
    period_type = Column(Enum("daily", "weekly", "monthly"))
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    
    # Summary stats
    total_alerts = Column(Integer, default=0)
    alerts_by_type = Column(JSON)  # {"frn_status_change": 5, "new_form470": 12}
    
    # Digest delivery
    digest_sent = Column(Boolean, default=False)
    digest_sent_at = Column(DateTime)
    
    created_at = Column(DateTime, default=datetime.utcnow)
```

---

## 🔌 API Endpoints

### Watch Management

```
POST   /api/v1/alerts/watch
       Add entity to watch list
       Body: { entity_type, entity_id, alert_triggers, frequency }

GET    /api/v1/alerts/watch
       Get all watched entities for current user
       Query: ?entity_type=school&is_active=true

PUT    /api/v1/alerts/watch/{config_id}
       Update watch configuration

DELETE /api/v1/alerts/watch/{config_id}
       Remove entity from watch list

POST   /api/v1/alerts/watch/bulk
       Add multiple entities at once
       Body: { entities: [{entity_type, entity_id}, ...] }
```

### Alert Management

```
GET    /api/v1/alerts
       Get all alerts for current user
       Query: ?is_read=false&severity=urgent&limit=50&offset=0

GET    /api/v1/alerts/unread-count
       Get count of unread alerts
       Returns: { count: 12 }

PUT    /api/v1/alerts/{alert_id}/read
       Mark alert as read

PUT    /api/v1/alerts/read-all
       Mark all alerts as read

DELETE /api/v1/alerts/{alert_id}
       Dismiss/delete alert
```

### Preferences

```
GET    /api/v1/alerts/preferences
       Get user's alert preferences

PUT    /api/v1/alerts/preferences
       Update preferences
       Body: {
         email_enabled: true,
         push_enabled: true,
         digest_frequency: "daily",
         digest_time: "06:00",
         quiet_hours_start: "22:00",
         quiet_hours_end: "07:00"
       }
```

---

## ⏰ Cron Jobs / Background Services

### 1. USAC Polling Service (Every 15 Minutes)

```python
# services/usac_polling_service.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler

class USACPollingService:
    """Polls USAC APIs for changes"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        
    async def start(self):
        # Poll Form 471 status changes
        self.scheduler.add_job(
            self.poll_form471_status,
            'interval',
            minutes=15,
            id='poll_form471'
        )
        
        # Poll Form 470 new postings
        self.scheduler.add_job(
            self.poll_form470_new,
            'interval',
            minutes=15,
            id='poll_form470'
        )
        
        # Poll FRN status
        self.scheduler.add_job(
            self.poll_frn_status,
            'interval',
            minutes=15,
            id='poll_frn'
        )
        
        self.scheduler.start()
    
    async def poll_form471_status(self):
        """Check for Form 471/FRN status changes"""
        # 1. Get all unique BENs/FRNs being watched
        watched_entities = await self.get_watched_frns()
        
        # 2. Query USAC for current status
        for entity in watched_entities:
            current_status = await usac_service.get_frn_status(entity.entity_id)
            cached_status = await cache.get(f"frn_status:{entity.entity_id}")
            
            # 3. Detect changes
            if current_status != cached_status:
                await self.create_status_change_alert(entity, cached_status, current_status)
                await cache.set(f"frn_status:{entity.entity_id}", current_status)
    
    async def poll_form470_new(self):
        """Check for new Form 470 postings"""
        # Get last poll timestamp
        last_poll = await cache.get("last_form470_poll") or datetime.utcnow() - timedelta(minutes=15)
        
        # Query for new Form 470s since last poll
        new_postings = await usac_service.get_form470_since(last_poll)
        
        for posting in new_postings:
            # Match against user watch configurations
            # (manufacturers, states, categories)
            matched_users = await self.match_form470_to_users(posting)
            
            for user in matched_users:
                await self.create_form470_alert(user, posting)
        
        await cache.set("last_form470_poll", datetime.utcnow())
```

### 2. Daily Digest Service (6:00 AM User's Timezone)

```python
# services/digest_service.py

class DigestService:
    """Generates and sends daily/weekly digest emails"""
    
    async def send_daily_digests(self):
        """Run at 6 AM for each timezone"""
        
        # Get users with daily digest enabled
        users = await self.get_users_for_digest("daily")
        
        for user in users:
            # Get alerts from last 24 hours
            alerts = await self.get_alerts_since(
                user.id, 
                datetime.utcnow() - timedelta(hours=24)
            )
            
            if alerts:
                digest = await self.generate_digest(user, alerts)
                await self.send_digest_email(user, digest)
    
    async def generate_digest(self, user, alerts):
        """Generate digest content"""
        return {
            "summary": {
                "total_alerts": len(alerts),
                "urgent": len([a for a in alerts if a.severity == "urgent"]),
                "form470_leads": len([a for a in alerts if a.alert_type == "new_form470"]),
                "status_changes": len([a for a in alerts if a.alert_type == "frn_status_change"]),
            },
            "highlights": alerts[:5],  # Top 5 most important
            "by_category": self.group_alerts_by_type(alerts),
            "action_required": [a for a in alerts if a.severity == "urgent" and not a.is_read],
        }
```

### 3. Deadline Reminder Service (Twice Daily)

```python
# services/deadline_service.py

class DeadlineService:
    """Sends reminders for approaching deadlines"""
    
    async def check_deadlines(self):
        """Run at 8 AM and 2 PM"""
        
        # Form 470 response deadlines
        form470s = await self.get_watched_form470s_with_deadlines()
        
        for form470 in form470s:
            days_until = (form470.deadline - datetime.utcnow()).days
            
            if days_until == 7:
                await self.send_deadline_alert(form470, "7 days remaining")
            elif days_until == 3:
                await self.send_deadline_alert(form470, "3 days remaining", severity="warning")
            elif days_until == 1:
                await self.send_deadline_alert(form470, "Tomorrow!", severity="urgent")
            elif days_until == 0:
                await self.send_deadline_alert(form470, "TODAY!", severity="urgent")
```

---

## 📧 Notification Channels

### 1. Email Notifications (Gmail SMTP)

```python
# services/email_service.py

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class EmailService:
    """Email notifications via Gmail SMTP"""
    
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        self.sender_email = os.environ["GMAIL_ADDRESS"]
        self.app_password = os.environ["GMAIL_APP_PASSWORD"]
    
    async def send_alert_email(self, user: User, alert: Alert):
        """Send individual alert email"""
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔔 SkyRate Alert: {alert.title}"
        msg["From"] = f"SkyRate AI <{self.sender_email}>"
        msg["To"] = user.email
        
        # HTML email template
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">SkyRate AI</h1>
            </div>
            
            <div style="padding: 30px; background: #f8fafc;">
                <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h2 style="color: #1e293b; margin-top: 0;">{alert.title}</h2>
                    <p style="color: #64748b; line-height: 1.6;">{alert.message}</p>
                    
                    <a href="https://skyrate.ai{alert.entity_url}" 
                       style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; 
                              border-radius: 8px; text-decoration: none; margin-top: 16px;">
                        View Details →
                    </a>
                </div>
            </div>
            
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                <p>You're receiving this because you have alerts enabled for this entity.</p>
                <a href="https://skyrate.ai/settings/alerts" style="color: #6366f1;">Manage Alert Settings</a>
            </div>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(html, "html"))
        
        with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
            server.starttls()
            server.login(self.sender_email, self.app_password)
            server.send_message(msg)
```

### 2. Web Push Notifications

```python
# services/push_service.py

from pywebpush import webpush, WebPushException

class PushService:
    """Web Push notifications using VAPID"""
    
    def __init__(self):
        self.vapid_private_key = os.environ["VAPID_PRIVATE_KEY"]
        self.vapid_public_key = os.environ["VAPID_PUBLIC_KEY"]
        self.vapid_claims = {
            "sub": "mailto:support@skyrate.ai"
        }
    
    async def send_push(self, user: User, alert: Alert):
        """Send web push notification"""
        
        # Get user's push subscriptions
        subscriptions = await self.get_user_subscriptions(user.id)
        
        payload = {
            "title": alert.title,
            "body": alert.message[:100],
            "icon": "/logo-192.png",
            "badge": "/badge-72.png",
            "data": {
                "url": alert.entity_url,
                "alert_id": alert.id
            },
            "actions": [
                {"action": "view", "title": "View"},
                {"action": "dismiss", "title": "Dismiss"}
            ]
        }
        
        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info=subscription.subscription_json,
                    data=json.dumps(payload),
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=self.vapid_claims
                )
            except WebPushException as e:
                if e.response.status_code == 410:  # Subscription expired
                    await self.remove_subscription(subscription.id)
```

### 3. In-App Notifications (WebSocket)

```python
# services/realtime_service.py

from fastapi import WebSocket

class RealtimeService:
    """Real-time in-app notifications via WebSocket"""
    
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}  # user_id -> websockets
    
    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = []
        self.connections[user_id].append(websocket)
    
    async def disconnect(self, user_id: int, websocket: WebSocket):
        self.connections[user_id].remove(websocket)
    
    async def broadcast_alert(self, user_id: int, alert: Alert):
        """Send alert to all user's connected clients"""
        if user_id in self.connections:
            for websocket in self.connections[user_id]:
                await websocket.send_json({
                    "type": "alert",
                    "data": {
                        "id": alert.id,
                        "title": alert.title,
                        "message": alert.message,
                        "severity": alert.severity,
                        "url": alert.entity_url,
                        "created_at": alert.created_at.isoformat()
                    }
                })
```

---

## 🖥️ Frontend Components

### 1. Alert Bell Icon (Header)

```tsx
// components/AlertBell.tsx

export function AlertBell() {
  const { unreadCount, alerts, markAsRead } = useAlerts();
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-slate-100"
      >
        <BellIcon className="w-6 h-6 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold">Notifications</h3>
            <button onClick={() => markAllAsRead()} className="text-sm text-indigo-600">
              Mark all read
            </button>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {alerts.map(alert => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
          
          <div className="p-3 border-t border-slate-100">
            <Link href="/alerts" className="text-sm text-indigo-600 hover:underline">
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 2. Alerts Page

```tsx
// app/alerts/page.tsx

export default function AlertsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Notifications</h1>
      
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <FilterButton active={filter === 'all'}>All</FilterButton>
        <FilterButton active={filter === 'unread'}>Unread</FilterButton>
        <FilterButton active={filter === 'urgent'}>Urgent</FilterButton>
      </div>
      
      {/* Alert List */}
      <div className="space-y-4">
        {alerts.map(alert => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
```

### 3. Watch Entity Button

```tsx
// components/WatchButton.tsx

export function WatchButton({ entityType, entityId, entityName }) {
  const { watchEntity, unwatchEntity, isWatching } = useWatch();
  const watching = isWatching(entityType, entityId);
  
  return (
    <button
      onClick={() => watching ? unwatchEntity(entityId) : watchEntity({ entityType, entityId, entityName })}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
        watching 
          ? 'bg-indigo-100 text-indigo-700' 
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {watching ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
      {watching ? 'Watching' : 'Watch'}
    </button>
  );
}
```

### 4. Watched Entities Manager

```tsx
// app/settings/watched/page.tsx

export default function WatchedEntitiesPage() {
  const { watchedEntities, updateConfig, removeWatch } = useWatch();
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Watched Entities</h1>
      
      {/* Group by type */}
      {['school', 'frn', 'form470', 'manufacturer', 'competitor'].map(type => (
        <section key={type} className="mb-8">
          <h2 className="text-lg font-semibold capitalize mb-4">{type}s</h2>
          
          {watchedEntities.filter(e => e.entity_type === type).map(entity => (
            <WatchedEntityCard 
              key={entity.id} 
              entity={entity}
              onUpdate={updateConfig}
              onRemove={removeWatch}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
```

### 5. Alert Preferences Panel

```tsx
// app/settings/alerts/page.tsx

export default function AlertPreferencesPage() {
  const { preferences, updatePreferences } = useAlertPreferences();
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Alert Preferences</h1>
      
      <div className="space-y-6">
        {/* Notification Channels */}
        <section className="bg-white rounded-xl p-6 border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Notification Channels</h2>
          
          <div className="space-y-4">
            <Toggle 
              label="Email Notifications" 
              checked={preferences.email_enabled}
              onChange={(v) => updatePreferences({ email_enabled: v })}
            />
            <Toggle 
              label="Push Notifications" 
              checked={preferences.push_enabled}
              onChange={(v) => updatePreferences({ push_enabled: v })}
            />
            <Toggle 
              label="In-App Notifications" 
              checked={preferences.in_app_enabled}
              onChange={(v) => updatePreferences({ in_app_enabled: v })}
            />
          </div>
        </section>
        
        {/* Digest Settings */}
        <section className="bg-white rounded-xl p-6 border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Digest Reports</h2>
          
          <Select 
            label="Digest Frequency"
            value={preferences.digest_frequency}
            options={['none', 'daily', 'weekly']}
            onChange={(v) => updatePreferences({ digest_frequency: v })}
          />
          
          <TimeInput 
            label="Delivery Time"
            value={preferences.digest_time}
            onChange={(v) => updatePreferences({ digest_time: v })}
          />
        </section>
        
        {/* Quiet Hours */}
        <section className="bg-white rounded-xl p-6 border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Quiet Hours</h2>
          <p className="text-slate-500 text-sm mb-4">
            Pause non-urgent notifications during these hours
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <TimeInput 
              label="Start"
              value={preferences.quiet_hours_start}
              onChange={(v) => updatePreferences({ quiet_hours_start: v })}
            />
            <TimeInput 
              label="End"
              value={preferences.quiet_hours_end}
              onChange={(v) => updatePreferences({ quiet_hours_end: v })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
```

---

## 📅 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database models and migrations
- [ ] Basic CRUD API endpoints
- [ ] Watch entity functionality
- [ ] In-app notification bell

### Phase 2: Background Services (Week 3-4)
- [ ] USAC polling service (Form 471, Form 470, FRN)
- [ ] Change detection engine
- [ ] Alert generation service
- [ ] Redis caching for status tracking

### Phase 3: Email Notifications (Week 5)
- [ ] Gmail SMTP integration
- [ ] Email templates (individual alerts, digests)
- [ ] Daily/weekly digest service
- [ ] Unsubscribe handling

### Phase 4: Web Push (Week 6)
- [ ] VAPID key generation
- [ ] Service worker for push
- [ ] Subscription management
- [ ] Push notification UI

### Phase 5: UI/UX (Week 7-8)
- [ ] Alert bell component
- [ ] Full alerts page
- [ ] Watched entities manager
- [ ] Preferences panel
- [ ] Watch buttons throughout app

### Phase 6: Polish & Testing (Week 9-10)
- [ ] Performance optimization
- [ ] Rate limiting
- [ ] Error handling
- [ ] Integration testing
- [ ] User acceptance testing

---

## 📈 Success Metrics

| Metric | Target |
|--------|--------|
| Alert delivery latency | < 5 minutes |
| Email open rate | > 40% |
| False positive rate | < 5% |
| User engagement with alerts | > 60% read rate |
| Reduction in manual USAC checks | 75% |

---

## 🔒 Security Considerations

1. **Rate Limiting**: Max 100 alerts/hour per user
2. **Unsubscribe**: One-click unsubscribe in all emails
3. **Data Retention**: Alerts deleted after 90 days
4. **PII Protection**: No sensitive data in push notifications
5. **Authentication**: All WebSocket connections require JWT

---

## 📚 Dependencies

```
# Backend
apscheduler==3.10.4      # Cron job scheduling
pywebpush==1.14.0        # Web Push
redis==5.0.1             # Caching & pub/sub
python-jose==3.3.0       # JWT for WebSocket auth

# Frontend
@tanstack/react-query    # Data fetching
socket.io-client         # WebSocket
workbox                  # Service worker
```

---

## 🚀 Quick Start for Implementation

```bash
# 1. Add environment variables
GMAIL_ADDRESS=alerts@skyrate.ai
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
VAPID_PUBLIC_KEY=BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxY
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REDIS_URL=redis://localhost:6379

# 2. Run migrations
alembic upgrade head

# 3. Start background services
python -m app.services.polling_service &
python -m app.services.digest_service &

# 4. Enable service worker in frontend
npm run build:sw
```

---

<p align="center">
  <strong>Document Version: 1.0</strong><br/>
  <em>Last Updated: January 2025</em>
</p>
