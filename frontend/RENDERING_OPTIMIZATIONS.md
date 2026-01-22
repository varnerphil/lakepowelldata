# Rendering Performance Optimizations

## Summary

The home page has been optimized to improve client-side rendering performance. The main strategies employed are:

1. **Lazy Loading Below-the-Fold Components**
   - `BasinPlotsChart` and `TributarySnowpack` are now dynamically imported
   - These components only load after the initial page render
   - Reduces initial JavaScript bundle size

2. **Suspense Boundaries**
   - Wrapped below-the-fold sections in React Suspense
   - Allows the page to show loading states while components load
   - Enables progressive rendering

3. **Deferred Value Updates**
   - Heavy computations in `HomeChartsWithFavorites` use `useDeferredValue`
   - Ramp access timeline calculations are deferred to avoid blocking initial render
   - React can interrupt these computations to keep the UI responsive

## Testing Rendering Performance

To test rendering performance, ensure the dev server is running, then:

```bash
cd frontend
node scripts/render-perf-test.js
```

This will measure:
- **First Contentful Paint (FCP)**: When the first content appears
- **Largest Contentful Paint (LCP)**: When the main content is visible
- **Time to Interactive (TTI)**: When the page is fully interactive
- **Total Blocking Time (TBT)**: Time the main thread is blocked
- **Cumulative Layout Shift (CLS)**: Visual stability metric

## Expected Improvements

With these optimizations:
- Initial render should be faster (less JavaScript to parse/execute)
- Page becomes interactive sooner
- Below-the-fold content loads progressively
- Smoother scrolling experience

## Future Optimizations

Additional optimizations that could be considered:
1. Code splitting for chart libraries (Recharts is large)
2. Virtual scrolling for large data lists
3. Web Workers for heavy data processing
4. Image optimization if images are added
5. Font optimization (preload critical fonts)
