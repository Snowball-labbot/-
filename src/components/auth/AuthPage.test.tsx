
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import AuthPage from './AuthPage';

const authStoreMocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));

// Extend expect with jest-dom matchers
expect.extend(matchers);

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    login: authStoreMocks.login,
    register: authStoreMocks.register,
  }),
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders login form by default', () => {
    render(<AuthPage />);
    const loginTitle = screen.getAllByText('登录账户');
    expect(loginTitle[0]).toBeInTheDocument();
    
    const emailInputs = screen.getAllByPlaceholderText('邮箱地址');
    expect(emailInputs[0]).toBeInTheDocument();
  });

  it('switches to register form', () => {
    render(<AuthPage />);
    const toggleButtons = screen.getAllByText('有邀请码? 创建账户');
    fireEvent.click(toggleButtons[0]);
    
    expect(screen.getAllByText('邀请注册')[0]).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('确认密码')[0]).toBeInTheDocument();
  });

  it('validates password match during registration', async () => {
    render(<AuthPage />);
    const toggleButtons = screen.getAllByText('有邀请码? 创建账户');
    fireEvent.click(toggleButtons[0]);

    const emailInputs = screen.getAllByPlaceholderText('邮箱地址');
    const pwdInputs = screen.getAllByPlaceholderText('密码 (至少8位)');
    const confirmInputs = screen.getAllByPlaceholderText('确认密码');
    const inviteInputs = screen.getAllByPlaceholderText('邀请码');
    
    fireEvent.change(emailInputs[0], { target: { value: 'test@example.com' } });
    fireEvent.change(pwdInputs[0], { target: { value: 'password123' } });
    fireEvent.change(confirmInputs[0], { target: { value: 'password456' } });
    fireEvent.change(inviteInputs[0], { target: { value: 'INVITE123' } });

    const submitButtons = screen.getAllByRole('button', { name: '注册并登录' });
    fireEvent.click(submitButtons[0]);

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(authStoreMocks.register).not.toHaveBeenCalled();
  });

  it('calls register when form is valid', async () => {
    authStoreMocks.register.mockResolvedValue(undefined);

    render(<AuthPage />);
    const toggleButtons = screen.getAllByText('有邀请码? 创建账户');
    fireEvent.click(toggleButtons[0]);

    const emailInputs = screen.getAllByPlaceholderText('邮箱地址');
    const pwdInputs = screen.getAllByPlaceholderText('密码 (至少8位)');
    const confirmInputs = screen.getAllByPlaceholderText('确认密码');
    const inviteInputs = screen.getAllByPlaceholderText('邀请码');

    fireEvent.change(emailInputs[0], { target: { value: 'test@example.com' } });
    fireEvent.change(pwdInputs[0], { target: { value: 'password123' } });
    fireEvent.change(confirmInputs[0], { target: { value: 'password123' } });
    fireEvent.change(inviteInputs[0], { target: { value: 'INVITE123' } });

    const submitButtons = screen.getAllByRole('button', { name: '注册并登录' });
    fireEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(authStoreMocks.register).toHaveBeenCalledWith('test@example.com', 'password123', 'INVITE123');
    });
  });

  it('calls login when login form is submitted', async () => {
    authStoreMocks.login.mockResolvedValue(undefined);

    render(<AuthPage />);

    const emailInputs = screen.getAllByPlaceholderText('邮箱地址');
    const pwdInputs = screen.getAllByPlaceholderText('密码 (至少8位)');

    fireEvent.change(emailInputs[0], { target: { value: 'test@example.com' } });
    fireEvent.change(pwdInputs[0], { target: { value: 'password123' } });

    const submitButtons = screen.getAllByRole('button', { name: '登录' });
    fireEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(authStoreMocks.login).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });
});
