import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Avatar from '@/components/Avatar';

describe('Avatar', () => {
  it('renders image when src is provided', () => {
    render(<Avatar src="https://example.com/photo.jpg" name="John" />);
    const img = screen.getByAltText('John');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('renders initial when no src provided', () => {
    render(<Avatar name="Grady Bunn" />);
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('renders initial when src is null', () => {
    render(<Avatar src={null} name="Bryan Chiodo" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to initial on image load error', () => {
    const { container } = render(<Avatar src="https://broken-url.com/photo.jpg" name="Grady Bunn" />);
    const img = container.querySelector('img')!;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('renders custom fallback on image error', () => {
    const { container } = render(
      <Avatar
        src="https://broken-url.com/photo.jpg"
        name="Test"
        fallback={<span data-testid="custom-fallback">FB</span>}
      />
    );
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('renders ? when no name provided', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('applies className and textClassName', () => {
    const { container } = render(
      <Avatar name="Test" className="w-12 h-12 bg-minerva-100" textClassName="text-lg font-bold" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-12', 'h-12', 'bg-minerva-100', 'rounded-full');
    const text = screen.getByText('T');
    expect(text).toHaveClass('text-lg', 'font-bold');
  });
});
