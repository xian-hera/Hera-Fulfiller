import React from 'react';
import { Banner, Page, Button } from '@shopify/polaris';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Page>
          <Banner
            title="Something went wrong"
            tone="critical"
          >
            <p>The page encountered an error. Please reload to continue.</p>
            <div style={{ marginTop: '16px' }}>
              <Button onClick={this.handleReload} variant="primary">
                Reload Page
              </Button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details style={{ marginTop: '16px' }}>
                <summary>Error details</summary>
                <pre style={{ 
                  marginTop: '8px', 
                  padding: '12px', 
                  background: '#f6f6f7',
                  borderRadius: '4px',
                  overflow: 'auto'
                }}>
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </Banner>
        </Page>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;