"""
Integration Tests for Subscriptions API
Tests payment status, subscription management, and checkout endpoints
"""

import pytest


class TestPaymentStatus:
    """Tests for payment status endpoint."""

    @pytest.mark.integration
    def test_payment_status_no_subscription(self, client, auth_headers):
        """Test payment status for user without subscription."""
        response = client.get("/api/v1/subscriptions/payment-status", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["requires_payment_setup"] is True
        assert data["subscription_status"] is None

    @pytest.mark.integration
    def test_payment_status_with_trial_subscription(self, client, test_user_with_subscription, test_db):
        """Test payment status for user with trial subscription (no Stripe IDs)."""
        from app.core.security import create_access_token
        
        token = create_access_token(data={"sub": str(test_user_with_subscription.id)})
        headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/v1/subscriptions/payment-status", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        # Should require payment setup since no Stripe IDs
        assert data["requires_payment_setup"] is True
        assert data["subscription_status"] == "trialing"

    @pytest.mark.integration
    def test_payment_status_unauthenticated(self, client):
        """Test payment status without authentication."""
        response = client.get("/api/v1/subscriptions/payment-status")
        
        assert response.status_code == 403


class TestSubscriptionStatus:
    """Tests for subscription status endpoint."""

    @pytest.mark.integration
    def test_subscription_status_no_subscription(self, client, auth_headers):
        """Test subscription status for user without subscription."""
        response = client.get("/api/v1/subscriptions/status", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["subscription"] is None
        assert data["requires_payment_setup"] is True

    @pytest.mark.integration
    def test_subscription_status_with_subscription(self, client, test_user_with_subscription, test_db):
        """Test subscription status for user with subscription."""
        from app.core.security import create_access_token
        
        token = create_access_token(data={"sub": str(test_user_with_subscription.id)})
        headers = {"Authorization": f"Bearer {token}"}
        
        response = client.get("/api/v1/subscriptions/status", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["subscription"] is not None
        assert data["subscription"]["status"] == "trialing"
        assert data["subscription"]["plan"] == "monthly"


class TestCreateCheckout:
    """Tests for checkout session creation."""

    @pytest.mark.integration
    def test_create_checkout_stripe_not_configured(self, client, auth_headers):
        """Test checkout when Stripe is not configured."""
        response = client.post("/api/v1/subscriptions/create-checkout",
            headers=auth_headers,
            json={
                "plan": "monthly",
                "success_url": "http://localhost:3000/success",
                "cancel_url": "http://localhost:3000/cancel"
            }
        )
        
        # Should return 503 when Stripe is not configured
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"].lower()

    @pytest.mark.integration
    def test_create_checkout_invalid_plan(self, client, auth_headers):
        """Test checkout with invalid plan type."""
        response = client.post("/api/v1/subscriptions/create-checkout",
            headers=auth_headers,
            json={
                "plan": "invalid_plan",
                "success_url": "http://localhost:3000/success",
                "cancel_url": "http://localhost:3000/cancel"
            }
        )
        
        # Should fail validation or Stripe config check first
        assert response.status_code in [422, 503]

    @pytest.mark.integration
    def test_create_checkout_unauthenticated(self, client):
        """Test checkout without authentication."""
        response = client.post("/api/v1/subscriptions/create-checkout",
            json={
                "plan": "monthly",
                "success_url": "http://localhost:3000/success",
                "cancel_url": "http://localhost:3000/cancel"
            }
        )
        
        assert response.status_code == 403


class TestCancelSubscription:
    """Tests for subscription cancellation."""

    @pytest.mark.integration
    def test_cancel_no_subscription(self, client, auth_headers):
        """Test canceling when user has no subscription."""
        response = client.post("/api/v1/subscriptions/cancel",
            headers=auth_headers,
            json={"reason": "Testing"}
        )
        
        assert response.status_code == 400
        assert "no active subscription" in response.json()["detail"].lower()

    @pytest.mark.integration
    def test_cancel_unauthenticated(self, client):
        """Test canceling without authentication."""
        response = client.post("/api/v1/subscriptions/cancel",
            json={"reason": "Testing"}
        )
        
        assert response.status_code == 403


class TestReactivateSubscription:
    """Tests for subscription reactivation."""

    @pytest.mark.integration
    def test_reactivate_no_subscription(self, client, auth_headers):
        """Test reactivating when user has no subscription."""
        response = client.post("/api/v1/subscriptions/reactivate", headers=auth_headers)
        
        assert response.status_code == 400

    @pytest.mark.integration
    def test_reactivate_unauthenticated(self, client):
        """Test reactivating without authentication."""
        response = client.post("/api/v1/subscriptions/reactivate")
        
        assert response.status_code == 403
