import React from 'react';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider, configure as configureI18n } from '@edx/frontend-platform/i18n';
import { sendTrackEvent } from '@edx/frontend-platform/analytics';
import { Factory } from 'rosie';

import Checkout from './Checkout';
import { submitPayment } from '../data/actions';
import '../__factories__/basket.factory';
import '../__factories__/userAccount.factory';
import { transformResults } from '../data/utils';

jest.mock('@edx/frontend-platform/analytics', () => ({
  sendTrackEvent: jest.fn(),
}));

jest.useFakeTimers('modern');

configureI18n({
  config: {
    ENVIRONMENT: process.env.ENVIRONMENT,
    LANGUAGE_PREFERENCE_COOKIE_NAME: process.env.LANGUAGE_PREFERENCE_COOKIE_NAME,
  },
  loggingService: {
    logError: jest.fn(),
    logInfo: jest.fn(),
  },
  messages: {
    uk: {},
    th: {},
    ru: {},
    'pt-br': {},
    pl: {},
    'ko-kr': {},
    id: {},
    he: {},
    ca: {},
    'zh-cn': {},
    fr: {},
    'es-419': {},
    ar: {},
  },
});

const mockStore = configureMockStore();

const applePaySession = { begin: jest.fn() };
global.ApplePaySession = jest.fn().mockImplementation(() => applePaySession);
global.ApplePaySession.canMakePayments = () => true;

describe('<Checkout />', () => {
  let wrapper;
  let store;
  let state;

  describe('with one product', () => {
    beforeEach(() => {
      const userAccount = Factory.build('userAccount');
      state = {
        authentication: {
          userId: 9,
          username: userAccount.username,
        },
        payment: {
          basket: Factory.build('basket', {}, { numProducts: 1 }),
        },
        i18n: {
          locale: 'en',
        },
      };

      sendTrackEvent.mockClear();
      store = mockStore(state);
      window.microform = { Mockroform: true };

      const component = (
        <IntlProvider locale="en">
          <Provider store={store}>
            <Checkout />
          </Provider>
        </IntlProvider>
      );
      wrapper = render(component);
    });

    it('submits and tracks paypal', async () => {
      const paypalButton = await screen.findByTestId('PayPalButton');
      fireEvent.click(paypalButton);

      expect(sendTrackEvent).toHaveBeenCalledWith('edx.bi.ecommerce.basket.payment_selected', {
        type: 'click',
        category: 'checkout',
        stripeEnabled: false,
        paymentMethod: 'PayPal',
      });
      expect(store.getActions().pop()).toEqual(submitPayment({ method: 'paypal' }));
    });

    // Apple Pay temporarily disabled per REV-927 - https://github.com/openedx/frontend-app-payment/pull/256

    it('renders PayPal as the active, visible checkout method', async () => {
      const paypalButton = await screen.findByTestId('PayPalButton');

      // PayPal is rendered and offered as an active payment-method button
      expect(paypalButton).toBeInTheDocument();
      expect(paypalButton).toHaveClass('payment-method-button', 'active');
      // ...and it displays the PayPal logo (alt text)
      expect(screen.getByAltText('PayPal')).toBeInTheDocument();
    });

    it('does not offer CyberSource as a checkout method', async () => {
      // Ensure the component has finished its initial render/effects
      await screen.findByTestId('PayPalButton');

      // The CyberSource credit-card form is never mounted (hideCybersourceCheckout === true)
      expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
      // The CyberSource "Credit Card" method button/logo is never rendered
      expect(screen.queryByAltText('Credit Card')).not.toBeInTheDocument();
      // No CyberSource submission event should have been tracked
      expect(sendTrackEvent).not.toHaveBeenCalledWith(
        'edx.bi.ecommerce.payment_mfe.payment_form_rendered',
        expect.objectContaining({ paymentProcessor: 'Cybersource' }),
      );

      // PayPal is the only payment-method button offered
      const methodButtons = wrapper.container.querySelectorAll('.payment-method-button');
      expect(methodButtons).toHaveLength(1);
      expect(methodButtons[0]).toBe(screen.getByTestId('PayPalButton'));
    });
  });

  describe('with a free checkout', () => {
    beforeEach(() => {
      const userAccount = Factory.build('userAccount');
      state = {
        authentication: {
          userId: 9,
          username: userAccount.username,
        },
        payment: {
          basket: transformResults(Factory.build(
            'basket',
            {
              is_free_basket: true,
            },
            { numProducts: 1 },
          )),
        },
        i18n: {
          locale: 'en',
        },
      };

      sendTrackEvent.mockClear();
      store = mockStore(state);
    });

    it('renders and tracks free checkout', async () => {
      render(
        <IntlProvider locale="en">
          <Provider store={store}>
            <Checkout />
          </Provider>
        </IntlProvider>,
      );

      const freeCheckoutButton = await screen.findByRole('link', { name: /place order/i });
      fireEvent.click(freeCheckoutButton);

      expect(sendTrackEvent).toHaveBeenCalledWith('edx.bi.ecommerce.basket.free_checkout', {
        type: 'click',
        stripeEnabled: false,
        category: 'checkout',
      });
    });
  });
});
