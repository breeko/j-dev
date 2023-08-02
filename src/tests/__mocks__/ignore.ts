const mock = jest.fn().mockImplementation(() => {
  return { add: () => {/**/}, ignores: () => false }; // ignores method always returns false
});

export default mock;
